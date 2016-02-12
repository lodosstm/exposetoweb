#!/usr/bin/env node
var path      = require('path');
var optimist  = require('optimist');

var Client    = require('../lib/client');

var default_settings = require('../lib/default_settings');

var argv  = optimist.usage('Usage: $0 [-v] [--rh] [--rp] [--lh] [--lp] [--uuid] [--rewrite-host]')
  .alias('h', 'help')
  .alias('v', 'verbose')
  .boolean('v')
  .string('rh')
  .string('rp')
  .string('lh')
  .string('lp')
  .string('uuid')
  .string('rewrite-host')
  .default('lh', default_settings.local_server.host)
  .default('lp', default_settings.local_server.port)
  .default('rh', default_settings.remote_server.host)
  .default('rp', default_settings.remote_server.port)
  .default('uuid', default_settings.uuid_file)
  .describe('h', 'show this help')
  .describe('lh', 'local server address')
  .describe('lp', 'local server port')
  .describe('rh', 'remote server address')
  .describe('rp', 'remote server port')
  .describe('uuid', 'path to uuid file')
  .describe('v', 'enable verbose mode')
  .describe('rewrite-host', 'rewrite hostname in http headers')
  .argv;

var config = {
  local_server: {
    host: argv.lh,
    port: Number(argv.lp)
  },
  remote_server: {
    host: argv.rh,
    port: Number(argv.rp)
  },
  uuid_file: path.resolve(argv.uuid),
  debug: argv.v || argv.verbose || false,
  rewrite_host: argv['rewrite_host'] || null,
  cli: true
};

if (argv.h || argv.help) {
  optimist.showHelp();
  process.exit(0);
}

var client = new Client(config);
client.connect();
