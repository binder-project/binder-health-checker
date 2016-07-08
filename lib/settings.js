var path = require('path')
var jsonfile = require('jsonfile')

var confPath = path.join(process.env['HOME'], '.binder/health.conf')
module.exports = jsonfile.readFileSync(confPath)
