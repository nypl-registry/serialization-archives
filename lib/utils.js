'use strict'
// var lexicon = require('nypl-registry-utils-lexicon')
var db = require('nypl-registry-utils-database')
var normalize = require('nypl-registry-utils-normalize')
// var serUtils = require('nypl-registry-utils-serialization')
var lexicon = require('nypl-registry-utils-lexicon')

// var async = require('async')

/**
* Given archives collection will return it w/ its shadowcat mapped object
*
* @param  {obj} collectionObject - the archives collection object
* @return {obj} the result object
*/
exports.returnShadowcat = function (collectionObject, cb) {
  // make the default bnumber wrong so if there is no bnumber present we won't find anything (there should normally be a catalog rec for archives)
  var bNumber = -9999999999
  if (collectionObject.bNumber) {
    try {
      bNumber = parseInt(normalize.normalizeBnumber(collectionObject.bNumber).replace('b', ''))
    } catch (e) {
      bNumber = -9999999999
    }
    if (isNaN(bNumber)) bNumber = -9999999999
  }
  var bib = { agents: [], terms: [] }

  if (bNumber < 0) {
    collectionObject.bib = bib
    cb(null, collectionObject)
    return false
  }

  db.returnCollectionShadowcat('bib', (err, shadowcatBib) => {
    if (err) console.log(err)
    shadowcatBib.find({_id: bNumber}, {'sc:agents': 1, 'sc:terms': 1}).toArray((err, bibs) => {
      if (err) console.log(err)
      if (bibs[0]) {
        bib.agents = bibs[0]['sc:agents']
        bib.terms = bibs[0]['sc:terms']
      }
      collectionObject.bib = bib
      cb(null, collectionObject)
    })
  })
}

/**
* Given an archives col/comp it will add the common triples shared between the two to the embeded resource obj
*
* @param  {obj} archivesObj - the archives object
* @return {obj} archivesObj - the modified archivesObj
*/
exports.addCommonTriples = function (archivesObj) {
  archivesObj.resourceObj.addTriple({
    predicate: 'dcterms:title',
    objectLiteral: archivesObj.title,
    source: lexicon.maps.dataUriAlias.archives,
    recordIdentifier: archivesObj.mss
  })

  // Notes
  archivesObj.notes.forEach(function (note) {
    if (lexicon.labels.notes[note.type]) {
      var noteText = normalize.removeHtml(note.text)
      noteText = lexicon.labels.notes[note.type] + ':\n' + noteText
      archivesObj.resourceObj.addTriple({
        predicate: 'skos:note',
        objectLiteral: noteText,
        source: lexicon.maps.dataUriAlias.archives,
        recordIdentifier: archivesObj.mss,
        label: lexicon.labels.notes[note.type]
      })
    }
  })

  var abstractText = ''
  archivesObj.abstracts.forEach(function (abstract) {
    abstractText = abstractText + ' ' + abstract
  })
  abstractText = normalize.removeHtml(abstractText).trim()

  if (abstractText !== '') {
    archivesObj.resourceObj.addTriple({
      predicate: 'dcterms:description',
      objectLiteral: abstractText,
      source: lexicon.maps.dataUriAlias.archives,
      recordIdentifier: archivesObj.mss
    })
  }

  // Identifiers
  if (archivesObj.mss) {
    // this is the collection level mss ID
    archivesObj.resourceObj.addTriple({
      predicate: 'dcterms:identifier',
      objectUri: 'u:msscoll:' + archivesObj.mss,
      source: lexicon.maps.dataUriAlias.archives,
      recordIdentifier: archivesObj.mss
    })
  }
  if (archivesObj.bNumber) {
    archivesObj.resourceObj.addTriple({
      predicate: 'dcterms:identifier',
      objectUri: 'u:bnum:' + archivesObj.bNumber,
      source: lexicon.maps.dataUriAlias.archives,
      recordIdentifier: archivesObj.mss
    })
  }
  if (archivesObj.callNumber) {
    archivesObj.resourceObj.addTriple({
      predicate: 'dcterms:identifier',
      objectUri: 'u:callnum:' + archivesObj.callNumber.replace(/\s/g, ''),
      source: lexicon.maps.dataUriAlias.archives,
      recordIdentifier: archivesObj.mss
    })
    archivesObj.resourceObj.addTriple({
      predicate: 'nypl:shelfMark',
      objectLiteral: archivesObj.callNumber,
      source: lexicon.maps.dataUriAlias.archives,
      recordIdentifier: archivesObj.mss
    })
  }
  if (archivesObj.matchedMms) {
    archivesObj.resourceObj.addTriple({
      predicate: 'dcterms:identifier',
      objectUri: 'u:uuid:' + archivesObj.mmsUuid,
      source: lexicon.maps.dataUriAlias.archives,
      recordIdentifier: archivesObj.mss
    })
  }

  // Dates
  archivesObj.dates.forEach(function (d) {
    if (parseInt(d.value) !== 0) {
      if (d.point === 'start') {
        archivesObj.resourceObj.addTriple({
          predicate: 'dbo:yearStart',
          objectLiteral: d.value,
          objectLiteralType: 'xsd:date',
          source: lexicon.maps.dataUriAlias.archives,
          recordIdentifier: archivesObj.mss
        })
      }
      if (d.point === 'end') {
        archivesObj.resourceObj.addTriple({
          predicate: 'dbo:yearEnd',
          objectLiteral: d.value,
          objectLiteralType: 'xsd:date',
          source: lexicon.maps.dataUriAlias.archives,
          recordIdentifier: archivesObj.mss
        })
      }
      if (d.point === 'exact') {
        archivesObj.resourceObj.addTriple({
          predicate: 'dcterms:created',
          objectLiteral: d.value,
          objectLiteralType: 'xsd:date',
          source: lexicon.maps.dataUriAlias.archives,
          recordIdentifier: archivesObj.mss
        })
      }
    }
  })

  // Location Owners
  if (lexicon.maps.mmsSerializeLocations[archivesObj.divisions.toUpperCase()]) {
    archivesObj.resourceObj.addTriple({
      predicate: 'nypl:owner',
      objectUri: 'orgs:' + lexicon.maps.mmsSerializeLocations[archivesObj.divisions.toUpperCase()],
      source: lexicon.maps.dataUriAlias.archives,
      recordIdentifier: archivesObj.mss
    })
  } else {
    archivesObj.resourceObj.addTriple({
      predicate: 'nypl:owner',
      objectUri: 'orgs:1000',
      source: lexicon.maps.dataUriAlias.archives,
      recordIdentifier: archivesObj.mss
    })
  }

  return archivesObj
}

/**
* Build a big list of agent strings and viaf/lc ids to prepare to be looked up in the Agents tables
*
* @param  {obj} archivesObj - the archives object
* @return {array} allAgents - All the agents that need to be looked up
*/
exports.parseAgents = function (archivesObj) {
  archivesObj.allAgentsString = []
  archivesObj.allAgentsViaf = []

  // first find all the orginators so we can set them later, this is found only in the archvies data
  var orginators = archivesObj.agents.filter((agent) => (agent.role.toLowerCase() === 'originator')).map((agent) => [agent.namePart, agent.valueURI])
  // flatten it down since we are returning an array, if it is false or null remove
  orginators = [].concat.apply([], orginators).filter((agent) => (agent)).map((name) => (name.search('viaf.org') > -1) ? name.split('/viaf/')[1] : name)

  var contributors = archivesObj.agents.filter((agent) => (agent.role.toLowerCase() !== 'originator')).map((agent) => [agent.namePart, agent.valueURI])
  // flatten it down since we are returning an array, if it is false or null remove
  contributors = [].concat.apply([], contributors).filter((agent) => (agent)).map((name) => (name.search('viaf.org') > -1) ? name.split('/viaf/')[1] : name)

  // do the same to subject names from the shadowcat bib record
  var subjects = archivesObj.bib.agents.filter((agent) => (!agent.contributor)).map((agent) => [agent.nameLocal, agent.nameLc, agent.nameViaf, agent.viaf])
  subjects = [].concat.apply([], subjects).filter((agent) => (agent))

  // do the same to agent names from the shadowcat bib
  var agents = archivesObj.bib.agents.filter((agent) => (agent.contributor)).map((agent) => [agent.nameLocal, agent.nameLc, agent.nameViaf, agent.viaf])
  agents = [].concat.apply([], agents).filter((agent) => (agent))

  // compress and remove any duplicates
  ;[orginators, contributors, subjects, agents].forEach((agentAry) => {
    agentAry.forEach((agent) => {
      // might be a LC
      if (agent.search('id.loc.gov') > -1) {
        // add it to the lookup and also the viaf lookup
        archivesObj.allAgentsViaf.push(agent.split('/names/')[1])
        return
      }
      // not VIAF a string name
      if (isNaN(agent)) {
        if (archivesObj.allAgentsString.indexOf(agent) === -1) {
          archivesObj.allAgentsString.push(agent)
        }
      } else {
        // is a viaf
        archivesObj.allAgentsViaf.push(agent)
      }
    })
  })

  return archivesObj
}

/**
* Build a big list of terms to lookup against the terms collection
*
* @param  {obj} archivesObj - the archives object
* @return {array} allAgents - All the agents that need to be looked up
*/
exports.parseTerms = function (archivesObj) {
  var allTerms = []

  archivesObj.allTermsString = []
  archivesObj.allTermsFast = []

  // we need to add in both the preconfigured subjects and the individual broken out subdivied subjects
  archivesObj.subjects.forEach((term) => {
    term = term.text
    // there are no URIs in the subjects in archives so just worry about adding in the cleaned preconfigured subject heading and the subdivided
    if (term.search('--') > -1) {
      var n = normalize.singularize(normalize.normalizeAndDiacritics(term))
      if (allTerms.indexOf(n) === -1) {
        archivesObj.allTermsString.push(term)
        allTerms.push(n)
      }
      term.split('--').forEach((sTerm) => {
        sTerm = sTerm.trim()
        // n = normalize.singularize(normalize.normalizeAndDiacritics(sTerm))
        if (allTerms.indexOf(sTerm) === -1) {
          archivesObj.allTermsString.push(sTerm)
          allTerms.push(sTerm)
        }
      })
    } else {
      // n = normalize.singularize(normalize.normalizeAndDiacritics(term))
      if (allTerms.indexOf(term) === -1) {
        archivesObj.allTermsString.push(term)
        allTerms.push(term)
      }
    }
  })

  // do the same for the shadowcat terms but they have FAST ids for a lot
  if (archivesObj.bib && archivesObj.bib.terms) {
    archivesObj.bib.terms.forEach((term) => {
      if (term.fast) {
        if (archivesObj.allTermsFast.indexOf(term.fast) === -1) archivesObj.allTermsFast.push(term.fast)
      } else {
        var n = normalize.singularize(normalize.normalizeAndDiacritics(term.nameLocal))
        if (allTerms.indexOf(n) === -1) {
          archivesObj.allTermsString.push(term.nameLocal)
          allTerms.push(n)
        }
      }
    })
  }
  return archivesObj
}

/**
* Build a big list of agent strings and viaf/lc ids to prepare to be looked up in the Agents tables
*
* @param  {obj} archivesObj - the archives object
* @return {obj} archivesObj - The archives object w/ modified resourceObj with the new agent triples
*/
exports.buildAgentAndTermsTriples = function (archivesObj) {
  var agentsIndex = []
  var termsIndex = []
  var agents = []
  var terms = []

  // the archives agents
  archivesObj.agents.forEach((agent) => {
    var uri = false
    var dereferenced = false

    // This should be fixed when ingest handles the string orgination field better TODO: revist when that is fixed
    if (agent.namePart === false) {
      return false
    }

    if (agent.valueURI) {
      if (agent.valueURI.search('viaf.org') > -1) uri = agent.valueURI.split('/viaf/')[1]
      if (agent.valueURI.search('id.loc.gov') > -1) uri = agent.valueURI.split('/names/')[1]
    }

    // first try to find the dereferenced agent in our lookup by the uri identfier
    if (uri) {
      // do we have this as a key in the dereference obj meaning we attempted to look it up
      if (archivesObj.agentDereference.hasOwnProperty(uri)) {
        if (archivesObj.agentDereference[uri]) dereferenced = archivesObj.agentDereference[uri]
        // try to look up the role
        dereferenced.role = lexicon.maps.archivesRoles[agent.role.toLowerCase()]
        if (!dereferenced.role) dereferenced.role = 'ctb'
        if (agentsIndex.indexOf(`${dereferenced.registry}|${dereferenced.role}`) === -1) {
          agentsIndex.push(`${dereferenced.registry}|${dereferenced.role}`)
          dereferenced.source = lexicon.maps.dataUriAlias.archives
          dereferenced.sourceId = archivesObj.mss
          agents.push(dereferenced)
        }
      } else {
        // potential problem, we did not even try to derference
        // console.log('No derefernce found:', agent)
      }
    }

    // now check if the name was dereferenced by string
    if (archivesObj.agentDereference.hasOwnProperty(agent.namePart)) {
      if (archivesObj.agentDereference[agent.namePart]) dereferenced = archivesObj.agentDereference[agent.namePart]
      // try to look up the role
      dereferenced.role = lexicon.maps.archivesRoles[agent.role.toLowerCase()]
      if (!dereferenced.role) dereferenced.role = 'ctb'

      if (agentsIndex.indexOf(`${dereferenced.registry}|${dereferenced.role}`) === -1) {
        agentsIndex.push(`${dereferenced.registry}|${dereferenced.role}`)
        dereferenced.source = lexicon.maps.dataUriAlias.archives
        dereferenced.sourceId = archivesObj.mss
        agents.push(dereferenced)
      }
    } else {
      // potential problem, we did not even try to derference
      // console.log('No derefernce found:', agent.namePart)
    }
  })

  // Now work the shadowcat agents
  if (archivesObj.bib) {
    archivesObj.bib.agents.forEach((agent) => {
      var dereferenced = false
      if (agent.relator) agent.relator = agent.relator.toLowerCase()
      var role = lexicon.maps.catalogRoles[agent.relator]
      if (!role) role = 'ctb'
      if (!agent.contributor) role = 'subject'

      // lookup against the data
      if (agent.viaf) {
        if (archivesObj.agentDereference.hasOwnProperty(agent.viaf)) {
          if (archivesObj.agentDereference[agent.viaf]) dereferenced = archivesObj.agentDereference[agent.viaf]
          if (agentsIndex.indexOf(`${dereferenced.registry}|${role}`) === -1) {
            dereferenced.role = role
            dereferenced.source = lexicon.maps.dataUriAlias.shadowcat
            dereferenced.sourceId = archivesObj.bNumber
            agentsIndex.push(`${dereferenced.registry}|${dereferenced.role}`)
            agents.push(dereferenced)
          }
        } else {
          // potential problem, we did not even try to derference
          // console.log('No derefernce found:', agent)
        }
      }

      // try the name if not dereferenced yet
      if (!dereferenced) {
        ;[agent.nameLc, agent.nameViaf, agent.nameLocal].forEach((name) => {
          if (name) {
            // now check if the name was dereferenced by string
            if (archivesObj.agentDereference.hasOwnProperty(name)) {
              if (archivesObj.agentDereference[name]) dereferenced = archivesObj.agentDereference[name]
              // try to look up the role
              dereferenced.role = role
              if (agentsIndex.indexOf(`${dereferenced.registry}|${dereferenced.role}`) === -1) {
                agentsIndex.push(`${dereferenced.registry}|${dereferenced.role}`)
                dereferenced.source = lexicon.maps.dataUriAlias.shadowcat
                dereferenced.sourceId = archivesObj.bNumber
                agents.push(dereferenced)
              }
            } else {
              // potential problem, we did not even try to derference
              // console.log('No derefernce found:', agent.namePart)
            }
          }
        })
      }
    })
  }

  // loop through all the agents and add in the triples,
  // we have some logic here to exlude verbose repetition of contributors if they are already present under a more specifc role
  // put them into specific arrays to controle which ones we come across frist
  var roles = agents.filter((agent) => (agent.role !== 'subject' && agent.role !== 'ctb'))
  var allOthers = agents.filter((agent) => (agent.role === 'subject' || agent.role !== 'ctb'))
  var addedAgents = []
  var addedSubjectAgents = []

  ;[roles, allOthers].forEach((ary) => {
    ary.forEach((agent) => {
      // we are doing the real roles first so that when we get to contributors we won't add them again
      // subjects just get added to the dcterms:subject predicate regardless
      if (agent.role !== 'subject' && agent.role !== 'ctb') {
        if (addedAgents.indexOf(agent.registry) === -1) {
          archivesObj.resourceObj.addTriple({
            predicate: `roles:${agent.role}`,
            objectUri: `agents:${agent.registry}`,
            source: agent.source,
            recordIdentifier: agent.sourceId,
            label: agent.nameControlled
          })
          addedAgents.push(agent.registry)
        }
      } else if (agent.role === 'subject') {
        if (addedSubjectAgents.indexOf(agent.registry) === -1) {
          archivesObj.resourceObj.addTriple({
            predicate: 'dcterms:subject',
            objectUri: `agents:${agent.registry}`,
            source: agent.source,
            recordIdentifier: agent.sourceId,
            label: agent.nameControlled
          })
          addedSubjectAgents.push(agent.registry)
        }
      } else if (agent.role === 'ctb') {
        // only add the contributor role if there is no other specific role already
        if (addedAgents.indexOf(agent.registry) === -1) {
          archivesObj.resourceObj.addTriple({
            predicate: 'roles:ctb',
            objectUri: `agents:${agent.registry}`,
            source: agent.source,
            recordIdentifier: agent.sourceId,
            label: agent.nameControlled
          })
          addedAgents.push(agent.registry)
        }
      }
    })
  })

  // now do the subjects
  // archives subjects
  archivesObj.subjects.forEach((term) => {
    term = term.text
    // there are no URIs in the subjects in archives so just worry about adding in the cleaned preconfigured subject heading and the subdivided
    if (term.search('--') > -1) {
      // first check to see if the whole complex term was dereferenced
      if (archivesObj.termDereference[term]) {
        if (termsIndex.indexOf(archivesObj.termDereference[term].registry) === -1) {
          termsIndex.push(archivesObj.termDereference[term].registry)
          terms.push(archivesObj.termDereference[term])
        }
      } else {
        term.split('--').forEach((sTerm) => {
          sTerm = sTerm.trim()
          if (archivesObj.termDereference[sTerm]) {
            if (termsIndex.indexOf(archivesObj.termDereference[sTerm].registry) === -1) {
              termsIndex.push(archivesObj.termDereference[sTerm].registry)
              terms.push(archivesObj.termDereference[sTerm])
            }
          } else {
            archivesObj.errorsTerms.push(sTerm)
          }
        })
      }
    } else {
      // not complex, just lookup the term
      if (archivesObj.termDereference[term]) {
        if (termsIndex.indexOf(archivesObj.termDereference[term].registry) === -1) {
          termsIndex.push(archivesObj.termDereference[term].registry)
          terms.push(archivesObj.termDereference[term])
        }
      } else {
        archivesObj.errorsTerms.push(term)
      }
    }
  })

  // do the shadowcat terms
  if (archivesObj.bib) {
    archivesObj.bib.terms.forEach((term) => {
      var dereferenced = false

      if (term.fast) {
        if (archivesObj.termDereference[term.fast]) {
          dereferenced = archivesObj.termDereference[term.fast]
        }
      }

      if (!dereferenced) {
        var termText = (term.nameFast) ? term.nameFast : term.nameLocal
        if (termText.search('--') > -1) {
          // first check to see if the whole complex term was dereferenced
          if (archivesObj.termDereference[termText]) {
            dereferenced = archivesObj.termDereference[termText]
          } else {
            termText.split('--').forEach((sTerm) => {
              sTerm = sTerm.trim()
              if (archivesObj.termDereference[sTerm]) {
                dereferenced = archivesObj.termDereference[sTerm]
              } else {
                archivesObj.errorsTerms.push(sTerm)
              }
            })
          }
        } else {
          // not complex, just lookup the term
          if (archivesObj.termDereference[termText]) {
            dereferenced = archivesObj.termDereference[termText]
          } else {
            archivesObj.errorsTerms.push(termText)
          }
        }
      }
      if (dereferenced) {
        if (termsIndex.indexOf(dereferenced.registry) === -1) {
          dereferenced.termSource = lexicon.maps.dataUriAlias.shadowcat
          dereferenced.termSourceId = archivesObj.bNumber
          termsIndex.push(dereferenced.registry)
          terms.push(dereferenced)
        }
      }
    })
  }

  // add them in
  terms.forEach((term) => {
    archivesObj.resourceObj.addTriple({
      predicate: 'dcterms:subject',
      objectUri: `terms:${term.registry}`,
      source: (term.termSource) ? term.termSource : lexicon.maps.dataUriAlias.archives,
      recordIdentifier: (term.termSourceId) ? term.termSourceId : archivesObj.mss,
      label: term.termControlled
    })
  })

  return archivesObj
}

/**
* Builds any orphan MMS resources (MMS items not matched to a archives component) and attach them to the collection
*
* @param  {obj} archivesObj - the archives object
* @return {obj} archivesObj - The archives object w/ modified resourceObj with the new agent triples
*/
exports.buildOrphanMms = function (archivesObj, cb) {
  // no need if no mms mapping
  if (!archivesObj.mmsUuid) {
    cb(null, archivesObj)
    return false
  }

  db.returnCollections({registryIngest: ['mmsItems', 'mmsCaptures']}, (err, returnCollections) => {
    if (err) console.log(err)
    var mmsItems = returnCollections.registryIngest.mmsItems
    mmsItems.find({ parents: archivesObj.mmsUuid, matchedArchives: {$exists: false} }).toArray((err, mssItems) => {
      if (err) console.log(err)
      console.log(mssItems[0])
      cb(null, archivesObj)
    })
  })
}
