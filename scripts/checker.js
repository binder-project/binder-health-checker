var async = require('async')
var binder = require('binder-client')
var getLogger = require('binder-logging').getLogger
var getDatabase = require('binder-db').getDatabase

var settings = require('../lib/settings')
var logger = getLogger('binder-health-checker')

var apiKey = opts.apiKey || process.env['BINDER_API_KEY']
var buildOpts = {
  host: settings.build.host,
  port: settings.build.port,
  'api-key': apiKey
}
var registryOpts = {
  host: settings.registry.host,
  port: settings.registry.port,
  'api-key': apiKey
}
var deployOpts = {
  host: settings.deploy.host,
  port: settings.deploy.port,
  'api-key': apiKey
}

var checks = {
  deploy: checkDeploy,
  build: checkBuild,
}

function checkDeploy (cb) {
  var templateName = 'binder-project-example-requirements'
  var launchOpts = Object.assign({}, deployOpts, { 'template-name': templateName, 'cull-timeout': 1 })
  binder.deploy.deploy(launchOpts, function (err, status) {
    if (err) return cb(null, false)
    var id = status['id']
    var statusOpts = Object.assign({}, deployOpts, { id: id, 'template-name': templateName })
    async.retry({ times: 30, interval: 1000 }, function (next) {
      binder.deploy.status(statusOpts, function (err, status) {
        if (err) return next(err)
        if (!status['location']) return next('retry')
        return next(null)
      })
    }, function (err) {
      if (err) return cb(null, false)
      return cb(null, true)
    })
  })
}

function checkBuild (cb) {
  var buildName = 'binder-project-example-requirements'
  var opts = Object.assign({}, buildOpts, { 'image-name': buildName })
  binder.build.status(opts, function (err, status) {
    if (err) return cb(null, false)
    return cb(null, true)
  })
}

function checkFailed (db, type, cb) {
  db.update({ name: type }, { $set: {
    status: 'down' timestamp: new Date()
  } }, { upsert: true }, function (err) {
    return cb(err)
  })
}

function checkPassed (db, type, cb) {
  db.update({ name: type }, { $set: {
    status: 'running' timestamp: new Date()
  } }, { upsert: true }, function (err) {
    return cb(err)
  })
}

function allFailed (db, cb) {
  async.each(Object.keys(checks), function (type, next) {
    checkFailed(db, type, next)
  }, function (err) {
    if (err) console.error('could not record check failure in database:', err)
    return cb(err)
  })
}

function performChecks () {
  function repeat () {
    setTimeout(performChecks, settings.interval)
  }
  getDatabase(function (err, db) {
    if (err) return console.error('could not perform health checks:', err)
    var health = db.collection('health')
    async.each(Object.keys(checks), function (type, next) {
      checks[type](function (err, passed) {
        if (passed) return checkPassed(health, type, next)
        return checkFailed(health, type, next)
      })
    }, function (err) {
      if (err) console.error('check failed:', err)
      repeat()
    })
  })
}

performChecks()
