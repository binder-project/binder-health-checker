var _ = require('lodash')
var inherits = require('inherits')
var path = require('path')
var request = require('request')

var BinderModule = require('binder-module')
var getLogger = require('binder-logging').getLogger
var getDatabase = require('binder-db').getDatabase
var startWithPM2 = require('binder-utils').startWithPM2
var settings = require('./settings.js')

/*
 * An HTTP server that implements the API of a Binder component
 * @constructor
 */
function BinderHealthChecker (opts) {
  if (!(this instanceof BinderHealthChecker)) {
    return new BinderHealthChecker(opts)
  }
  opts = _.merge(opts, settings)
  BinderHealthChecker.super_.call(this, 'binder-health-checker', ['health'], opts)
  this.logger = getLogger('binder-health-checker')

  // db is set in _start
  this.db = null
  this.backgroundTasks = null
}
inherits(BinderHealthChecker, BinderModule)

/**
 * Attached module's routes/handlers to the main app object
 */
BinderHealthChecker.prototype._makeBinderAPI = function () {
  return {
    status: this._getHealthStatus.bind(this),
  }
}

// binder-health-checker API

/**
 * HTTP handler
 * Returns the health status of all Binder components
 */
BinderHealthChecker.prototype._getHealthStatus = function (api) {
  var health = this.db.collection('health')
  health.find({}, function (err, docs) {
    if (err) return api._badQuery({ error: err })
    return api._success(docs)
  })
}

/**
 * Performs all module-specific startup behavior
 */
BinderHealthChecker.prototype._start = function (cb) {
  var self = this
  this.backgroundTasks = [
    {
      name: 'binder-health-checker',
      script: path.join(__dirname, '../scripts/checker.js'),
      env: { BINDER_API_KEY: this.apiKey },
      silent: true
    }
  ]
  this.backgroundTasks.forEach(function (task) {
    startWithPM2(task)
  })
  getDatabase(function (err, conn) {
    if (err) throw err
    self.db = conn
    return cb()
  })
}

/**
 * Performs all module-specific stopping behavior
 */
BinderHealthChecker.prototype._stop = function (cb) {
  var self = this
  if (this.backgroundTasks) {
    self.logger.info('stopping background tasks')
    async.each(this.backgroundTasks, function (task, next) {
      var name = task.name
      self.logger.info('stopping background task: {0}'.format(name))
      proc.exec('pm2 delete ' + name, next)
    }, function (err) {
      return cb(err)
    })
  } else {
    return cb()
  }
 return cb()
}

module.exports = BinderHealthChecker
