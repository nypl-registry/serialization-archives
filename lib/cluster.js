'use strict'

module.exports = function (cb) {
  var db = require('nypl-registry-utils-database')
  var serUtils = require('nypl-registry-utils-serialization')
  var cluster = require('cluster')
  // var crier = require('nypl-registry-utils-crier')
  // var utils = require('../lib/utils.js')
  var clc = require('cli-color')
  var totalBots = 1
  var botRanges = []
  //
  // MASTER PROCESS
  //
  if (cluster.isMaster) {
    var totalDone = 0
    var totalTodo = 10000000000
    var totalAgentsAdded = 0
    var percent = 0
    var oldPercent = -1
    var activeMessage = ''

    // crier.registrySay(':vertical_traffic_light: Terms Serialization Archives Collections starting.')

    // finds the counts in the bib records and split it up among the number of requested bots
    var findBibSplit = (splitCount, callback) => {
      db.returnCollectionRegistry('archivesCollections', (err, archivesCollections) => {
        if (err) console.log(err)
        archivesCollections.find({}, {mssDb: 1}).sort({mssDb: 1}).limit(1).toArray((err, resultsMin) => {
          if (err) console.log(err)
          archivesCollections.find({}, {mssDb: 1}).sort({mssDb: -1}).limit(1).toArray((err, resultsMax) => {
            if (err) console.log(err)
            var minMssDb = resultsMin[0]._id
            var maxMssDb = resultsMax[0]._id + 10 // add ten so it overshoots the end, make sure the last record it done
            callback(serUtils.returnDistributedArray(maxMssDb, minMssDb, splitCount))
          })
        })
      })
    }

    // fire off a count request so we know the progress
    db.returnCollectionRegistry('archivesCollections', (err, archivesCollections) => {
      if (err) console.log(err)
      archivesCollections.count((err, count) => {
        if (err) console.log(err)
        totalTodo = count
      })
    })

    // this function spawns the worker and handles passing out bib ranges ++ the counter and restarting a worker if needed
    var spawnWorker = () => {
      var worker = cluster.fork()
      console.log('Spawing worker', worker.id)
      worker.on('message', function (msg) {
        // when a worker sends a "request" message we return one of the ranges for it to work on
        if (msg.request) {
          if (botRanges.length === 0) {
            worker.send({ die: true })
          } else {
            worker.send({ work: botRanges.shift() })
          }
        }
        // when the worker sends a counter message we ++ the counter
        if (msg.counter) {
          totalDone = totalDone + msg.counter
          percent = Math.floor(totalDone / totalTodo * 100)
          activeMessage = `Archives Collections Resource Serialization: ${percent}% ${totalDone} Collections worked. Collections Processed: ${totalAgentsAdded} Bots:${totalBots}`
          if (percent % 25 === 0 && percent !== oldPercent) {
            // crier.registrySay(activeMessage)
            oldPercent = percent
          }
          process.stdout.cursorTo(0)
          process.stdout.write(clc.black.bgYellowBright(activeMessage))
        }
        if (msg.counterAdded) {
          totalAgentsAdded = totalAgentsAdded + msg.counterAdded
        }

        if (msg.restart) {
          console.log('Restarting this range:', msg.restart)
          // crier.registrySay('Restarting Bot. Range:', msg.restart)
          botRanges.push(msg.restart)
          spawnWorker()
          totalBots++
        }
      })
    }

    // will return a array of objects telling what bnumber to start and end on
    // loop through and spawn a worker for each range of bnumbers
    findBibSplit(totalBots, (botSplit) => {
      // asign it to the master scoped var
      botRanges = botSplit
      // spawn one for each range
      botSplit.forEach((x) => {
        spawnWorker()
      })
    })

    // when the worker exists we wait a sec and see if it was the last worker, if so kill the main process == end of the script
    cluster.on('exit', (worker, code, signal) => {
      totalBots = totalBots - 1
      setTimeout(() => {
        if (Object.keys(cluster.workers).length === 0) {
          // crier.registrySay(activeMessage)
          // crier.registrySay(':checkered_flag: Archives Collections Term Serialization: Complete')
          if (cb) {
            setTimeout(() => {
              cb()
              cb = null // make sure it doesn't get called again since we are using setTimeout to check the worker status
            }, 1000)
          }
        }
      }, 500)
    })
  } else {
    //
    // THE WORKER
    //
    var utils = require('../lib/utils')
    var lexicon = require('nypl-registry-utils-lexicon')
    var _ = require('highland')
    // keep track of what we are working on incase we need to ask the master process to restart the worker
    var workStart = 0
    var workEnd = 0
    var localCounter = 0

    // useful for debuging and restarting incase something bad happens
    var worked = false
    var workedLastOn = null
    setInterval(() => {
      if (!worked) {
        // console.log(`${cluster.worker.id} has not worked in the last few min:`, workedLastOn)
        db.logError(`${cluster.worker.id} has not worked in the last few min:`, JSON.stringify(workedLastOn))
        console.log(`Going to restart worker: ${cluster.worker.id}`)
        process.send({ restart: { start: workStart, end: workEnd } })
        process.exit(1)
      }
      worked = false
    }, 120000)

    process.on('message', (msg) => {
      if (msg.die) {
        console.log('Done Working. #', cluster.worker.id)
        process.exit(0)
      }
      if (msg.work) {
        workStart = msg.work.start
        workEnd = msg.work.end
        db.returnCollectionRegistry('archivesCollections', (err, archivesCollections) => {
          if (err) console.log(err)
          // this works by streaming a cursor between the two start/end range of bnumbers
          _(archivesCollections.find({$and: [{mssDb: {$gte: msg.work.start}}, {mssDb: {$lt: msg.work.end}}]}))
            .map((archivesCollection) => {
              // for debuging
              worked = true
              workedLastOn = archivesCollection
              // keep track of where we are
              workStart = archivesCollection.mssDb
              // ++ the counter
              if (++localCounter % 100 === 0 && localCounter !== 0) process.send({ counter: 100 })
              return archivesCollection
            })
            .map(_.curry(utils.returnShadowcat)) // grab the shadowcat data for this collection
            .nfcall([])
            .series()
            .map((archivesCollection) => {
              // this is our collection object, group of triples
              archivesCollection.resourceObj = new serUtils.ResourceObject()
              // RDF Type
              archivesCollection.resourceObj.addTriple({
                predicate: 'rdf:type',
                objectUri: 'nypl:Collection',
                source: lexicon.maps.dataUriAlias.archives,
                recordIdentifier: archivesCollection.mss
              })

              // Resource type
              archivesCollection.resourceObj.addTriple({
                predicate: 'dcterms:type',
                objectUri: 'resourcetypes:col',
                source: lexicon.maps.dataUriAlias.archives,
                recordIdentifier: archivesCollection.mss
              })

              // add in some common triples shared between collections and components
              archivesCollection = utils.addCommonTriples(archivesCollection)

              // build a big agent list to look up from the archives/shadowcat data
              archivesCollection = utils.parseAgents(archivesCollection)

              // build a big list of the subjects to lookup against the terms collection
              archivesCollection = utils.parseTerms(archivesCollection)

              // console.log(JSON.stringify(resourceObj, null, 2))
              return archivesCollection
            })
            .map(_.curry(serUtils.dereferenceAgents)) // we now have all the agents matched against the agent collection we can build those tripels
            .nfcall([])
            .series()
            .map(_.curry(serUtils.dereferenceTerms)) // we now have all the terms matched against the term collection we can build those tripels
            .nfcall([])
            .series()
            .map((archivesCollection) => {
              // we can now build the agent and terms
              archivesCollection = utils.buildAgentAndTermsTriples(archivesCollection)
              return archivesCollection
            })
            .map(_.curry(utils.buildOrphanMms)) // Now look for orphan MMS items, items that belong to the collection but could not be matched to a component
            .nfcall([])
            .series()
            .done((archivesCollection) => {
              console.log('Done Working. #', cluster.worker.id)
              process.exit(0)
            })
        })
      }
    })

    // ask for the our assignment, the bnumber range
    process.send({ request: true })
  }
}
