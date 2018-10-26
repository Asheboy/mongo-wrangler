#!/usr/bin/env node
var path = require('path')
var execSync = require('child_process').execSync
var argv = require('./minimist')(process.argv.slice(2), { boolean: ['v'] })
var color = require('./color')
var databaseName = argv._[0]
var verbose = !!argv.v
var customExcludes = argv.e || []

function printUsage () {
  console.log('')
  console.log('Usage:')
  console.log('\t' + path.basename(process.argv[1]) + ' [options] database')
  console.log('Options:')
  console.log('\t-v - verbose')
  console.log('\t-e - comma separated list of collections to exclude')
  console.log('\n')
}

if (!databaseName) {
  console.error(color('Missing database name', 'red'))
  printUsage()
  process.exit(1)
}

function exec(cmd) {
  const output = execSync(cmd).toString()
  if (verbose) {
    console.log('$ ' + color(cmd, 'dark grey'))
    console.log(output)
  }
  return output
}

var supportCollectionExclude = !/v2/.test(exec('mongo --version'))

var excludeCollections = [
  'userActivity',
  'questionResponse',
  'sessions',
  'formResponse',
  'latLongCache',
  `customerEventLog`,
  `order`
].concat(customExcludes)
var date = new Date().toISOString().substr(0, 19).replace(/[^\d]/g,'')
var newDatabaseName = databaseName + '-' + date
var tarFilename = newDatabaseName + '.tar.bz'
var likelyRestoreName = databaseName.replace(/(staging|production)$/, 'development')
console.log(color('\n💩\tDumping', 'grey'), color(databaseName, 'yellow'))
console.log(color('\n❌\tExcluding collections', 'grey'), color(excludeCollections.join(', '), 'green'))
if (supportCollectionExclude) {
  exec('mongodump ' + (!verbose ?'--quiet' : '') + ' --db ' + databaseName + ' ' + excludeCollections.map(function (collection) { return '--excludeCollection ' + collection }).join(' '))
} else {
  exec('mongodump ' + (!verbose ?'--quiet' : '') + ' --db ' + databaseName)
}
console.log(color('✨\tRestoring locally to ', 'grey') + color(newDatabaseName, 'yellow'),)
exec('mongorestore ' + (!verbose ?'--quiet' : '') + ' -d ' + newDatabaseName + ' dump/' + databaseName)

if (!supportCollectionExclude) {
  excludeCollections.forEach(function (collection) {
    exec('echo "db.getCollection(\'' + collection + '\').drop()" || mongo ' + newDatabaseName)
  })
}

console.log(color('🔏\tObfuscating ' + newDatabaseName, 'grey'))
exec('mongo ' + newDatabaseName + ' ' + './obfuscate.js')
exec('rm -rf dump')
console.log(color('💩\tDumping ' + newDatabaseName, 'grey'),)
exec('mongodump ' + (!verbose ?'--quiet' : '') + ' --db ' + newDatabaseName)
console.log(color('🗜\tCompressing ' + tarFilename, 'grey'))
exec('tar jcf ' + tarFilename + ' dump')
exec('rm -rf dump')
console.log(color('⬆️\tUploading to xfer', 'grey'))
var url = exec('curl --silent -H "Max-Days: 1" -H "Max-Downloads: 10" --upload-file ./' + tarFilename + ' https://xfer.clock.co.uk/' + tarFilename).toString()
exec('rm -rf ' + tarFilename)
exec('echo "db.dropDatabase()" | mongo ' + newDatabaseName)

console.log(color('\n✅\How to restore the 💩\n', 'white'))
console.log(color('If you have cloned https://github.com/clocklimited/mongo-wrangler.git` then use this\n', 'yellow'))
console.log(color('\t./restore.js ' + likelyRestoreName + ' ' + url + '\n', 'white'))
console.log(color('Too lazy for git cloning? Use this:\n', 'yellow'))
console.log(color('\tcurl --silent https://raw.githubusercontent.com/clocklimited/mongo-wrangler/master/restore.js | tail -n+2 | DATABASE_NAME=' + likelyRestoreName + ' URL=' + url + ' node\n', 'white'))
