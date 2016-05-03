'use strict'

function SerializeArchives () {
  /**
   * A cluster script the spawns workers to build registry resources from archives
   *
   * @param  {function} cb - Nothing returned
   */
  this.start = require(`${__dirname}/lib/cluster`)
}

module.exports = exports = new SerializeArchives()
