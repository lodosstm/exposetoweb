#!/usr/bin/env node
var fs          = require('fs');
var net         = require('net');
var path        = require('path');
var optimist    = require('optimist');
var node_uuid   = require('node-uuid');
var Transform   = require('stream').Transform;

var argv      = optimist.usage('Usage: $0 [-v] [--rh] [--rp] [--lh] [--lp] [--ps] [--uuid] [--rewrite-host]')
  .alias('h', 'help')
  .alias('v', 'verbose')
  .boolean('v')
  .string('rh')
  .string('rp')
  .string('lh')
  .string('lp')
  .string('uuid')
  .string('rewrite-host')
  .default('lh', 'localhost')
  .default('lp', 3001)
  .default('rh', 'proxy.ldste.am')
  .default('rp', 5000)
  .default('ps', 10)
  .default('uuid', path.resolve(process.env.HOME, '.exposetoweb_uuid'))
  .describe('h', 'show this help')
  .describe('lh', 'local server address')
  .describe('lp', 'local server port')
  .describe('ps', 'socket pool size')
  .describe('rh', 'remote server address')
  .describe('rp', 'remote server port')
  .describe('uuid', 'path to uuid file')
  .describe('v', 'enable verbose mode')
  .describe('rewrite-host', 'rewrite hostname in http headers')
  .argv;

var uuid;
var config  = {
  local_server: {
    host: argv.lh,
    port: Number(argv.lp)
  }, 
  remote_server: {
    host: argv.rh,
    port: Number(argv.rp)
  },
  pool_size: Number(argv.ps),
  uuid_file: path.resolve(argv.uuid),
  debug: argv.v || argv.verbose || false
};

if (argv.h || argv.help) {
  optimist.showHelp();
  process.exit(0);
}
if (fs.existsSync(config.uuid_file)) {
  uuid = fs.readFileSync(config.uuid_file).toString();
} else {
  uuid = node_uuid.v4();
  fs.writeFileSync(config.uuid_file, uuid);
}
console.debug = config.debug ? console.log.bind(console) : function () {};

console.log('Your id is ' + uuid);

function test_local_connection (cb) {
  var client = net.connect(config.local_server.port, config.local_server.host, function() {
    client.end();
    cb();
  });
  client.once('error', cb);
}

function rewrite_host (chunk, enc, cb) {
  if (!argv['rewrite-host']) {
    return cb(null, chunk);
  }
  try {
    var lines = chunk.toString().split('\r\n').slice(0,2);
    if (lines.length !== 2) {
      return cb(null, chunk);
    }
    var old_length = new Buffer(lines.join('\r\n'), 'utf-8').length;
    var new_lines = lines.map(function (line) {
      var header = line.split(': ');
      if (header[0] === 'Host') {
        var port = header[1].split(':')[1];
        var new_line = 'Host: ' + argv['rewrite-host'];
        if (port && Number(port)) {
          new_line += ':' + port;
        }
        console.debug('Rewrited %s to %s', line, new_line);
        return new_line;
      } else {
        return line;
      }
    }).join('\r\n');
    var temp_buffer = new Buffer(new_lines, 'utf-8');
    var rest_buffer = chunk.slice(old_length);
    var return_buffer = Buffer.concat([temp_buffer, rest_buffer], temp_buffer.length + rest_buffer.length);
    return cb(null, return_buffer);
  } catch (e) {
    console.error(e, e.stack);
    return cb(null, chunk);
  }
}

function createPoolConnection () {
  var remote_socket = net.connect(config.remote_server.port, config.remote_server.host, function() {
    console.debug('New connection to %s:%d was added to pool', config.remote_server.host, config.remote_server.port);

    remote_socket.write(JSON.stringify({uuid: uuid}));

    remote_socket.once('data', function (data) {
      remote_socket.pause();
      console.debug('Incoming message: ', data.toString());
      createPoolConnection();
      var local_client = net.connect(config.local_server.port, config.local_server.host, function() {
        console.debug('New connection to %s:%s estabilished', config.local_server.host, config.local_server.port);

        var host_transform = new Transform();
        host_transform._transform = rewrite_host;

        rewrite_host(data, null, function (err, data) {
          local_client.write(data);
          remote_socket.pipe(host_transform).pipe(local_client);
          local_client.pipe(remote_socket);
        })
      });
      local_client.on('error', function (e) {
        console.error('Error in local connection', e);
        local_client.end();
        remote_socket.end(); 
      });
      remote_socket.on('error', function (e) {
        console.error('Error in remote connection', e);
        local_client.end();
        remote_socket.end(); 
      });
    });
  });
}

test_local_connection(function (err) {
  if (err) {
    console.error('Could not connect to local server (%s:%d)', config.local_server.host, config.local_server.port);
    process.exit(1);
  }
  var remote_client = net.connect(config.remote_server.port, config.remote_server.host, function() {
    console.debug('Connected to %s:%d', config.remote_server.host, config.remote_server.port);
    console.log('Connection estabilished.\n%s.%s <-> %s:%s', uuid, config.remote_server.host, config.local_server.host, config.local_server.port);

    remote_client.write(JSON.stringify({uuid: uuid}));
    var timer = setTimeout(function() {
      console.log('Server does not respond');
      process.exit();
    }, 1000);
    remote_client.once('data', function (data) {
      if (!JSON.parse(data.toString()).ok) {
        console.error('Connection was closed by server');
        return remote_client.end();
      }
      clearTimeout(timer);
      for (var i = 0; i < config.pool_size; i++) {
        createPoolConnection();
      }

      var interval = setInterval(function () {
        console.debug('Sending ping request to server');

        remote_client.once('data', function (data) {
          console.debug('Ping response: ' + data.toString());
          if (data.toString() !== 'pong') {
            console.error('Invalid ping response');
          }
        });

        remote_client.write('ping');
      }, 5000);
    });
  });


  function cleanUp (e) {
    if (e) {
      console.error(e);
      console.error(e.stack);
    }
    console.debug('Close master socket');
    remote_client.end();
    process.exit();
  }

  process.on('SIGINT', cleanUp);
  process.on('uncaughtException', cleanUp);

  remote_client.on('error', function(e) {
    console.log(e);
    console.error('Could not connect to remote server (%s:%d)', config.remote_server.host, config.remote_server.port);
  });

  remote_client.on('end', function() {
    console.debug('disconnected from remote server');
  });
});