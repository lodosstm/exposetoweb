var fs        = require('fs');
var net       = require('net');
var path      = require('path');
var optimist  = require('optimist');
var node_uuid = require('node-uuid');

optimist.usage('Usage: $0 [-v] [--rh] [--rp] [--lh] [--lp] [--ps] [--uuid]');
optimist.alias('h', 'help');
optimist.alias('v', 'verbose');
optimist.describe('h', 'show this help');
optimist.describe('lh', 'local server address (default localhost)');
optimist.describe('lp', 'local server port (default 3001)');
optimist.describe('ps', 'socket pool size (default 10)');
optimist.describe('rh', 'remote server address (default localhost)');
optimist.describe('rp', 'remote server port (default 5000)');
optimist.describe('uuid', 'path to uuid file (default ./uuid)');
optimist.describe('v', 'enable verbose mode');

var uuid;
var argv    = optimist.argv;
var config  = {
  local_server: {
    host: argv.lh || 'localhost',
    port: argv.lp || 3001
  }, 
  remote_server: {
    host: argv.rh || 'localhost',
    port: argv.rp || 5000
  },
  pool_size: argv.ps || 10,
  uuid_file: argv.uuid || path.join(__dirname, 'uuid'),
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

function createPoolConnection () {
  var remote_socket = net.connect(config.remote_server.port, config.remote_server.host, function() {
    console.debug('Pool connection to ' + config.remote_server.host + ':' + config.remote_server.port + ' was added');

    remote_socket.write(JSON.stringify({uuid: uuid}));

    remote_socket.once('data', function (data) {
      createPoolConnection();
      var local_client = net.connect(config.local_server.port, config.local_server.host, function() {
        local_client.write(data);
        remote_socket.pipe(local_client);
        local_client.pipe(remote_socket);
      });
    });
  });
}

var remote_client = net.connect(config.remote_server.port, config.remote_server.host, function() {
  console.debug('Connected to ' + config.remote_server.host + ':' + config.remote_server.port);

  remote_client.write(JSON.stringify({uuid: uuid}));

  for (var i = 0; i < 10; i++) {
    createPoolConnection();
  }
});

remote_client.on('error', function() {
  console.error('Could not connect to remote server.');
});

remote_client.on('end', function() {
  console.debug('disconnected from remote server');
});