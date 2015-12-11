var fs        = require('fs');
var net       = require('net');
var util      = require('util');
var events    = require('events');
var node_uuid = require('node-uuid');
var Transform = require('stream').Transform;

var logger = new console.Console(process.stdout, process.stderr);

function Client (config) {
  this.config = config;

  this.socket = null;
  this.pool = [];
  this.closed = false;
  this.connected = false;

  if (fs.existsSync(config.uuid_file)) {
    this.uuid = fs.readFileSync(config.uuid_file).toString();
  } else {
    this.uuid = node_uuid.v4();
    fs.writeFileSync(config.uuid_file, this.uuid);
  }

  logger.debug = config.debug ? logger.log.bind(logger) : function () {};
  if (!config.cli) {
    Object.keys(logger).forEach(function (key) {
      if (logger[key] instanceof Function) {
        logger[key] = function () {};
      }
    });
  }
}

util.inherits(Client, events.EventEmitter);

Client.prototype.connect = function (cb) {
  var self = this;

  self.__test_local_connection(function (hadErr) {
    if (hadErr) {
      logger.error('Could not connect to local server (%s:%d)', self.config.local_server.host, self.config.local_server.port);
      return self.close(cb ? cb.bind(cb, new Error(
        util.format('Could not connect to local server (%s:%d)', self.config.local_server.host, self.config.local_server.port)))
      : null);
    }

    self.__setup_master(function (err) {
      if (err) {
        logger.error(err);
        return self.close(cb.bind(cb, err));
      }
      self.__setup_socket_pool();
      self.connected = true;
      if (cb) {
        cb(null, util.format('%s.%s', self.uuid, self.config.remote_server.host));
      }
    });
  });
};

Client.prototype.close = function (cb) {
  var self = this;
  var callback = cb || (self.config.cli ? process.exit() : null);

  self.__clear_ping_interval();

  self.pool.splice(-self.pool.length).forEach(function (socket) {
    socket.removeAllListeners();
    socket.end();
    socket.unref();
  });

  if (self.socket && !self.socket.destroyed) {
    self.closed = true;
    self.emit('close');
    self.socket.on('close', function () {
      self.connected = false;
      delete self.socket;
      if (callback) {
        callback();
      }
    });
    self.socket.end();
  } else {
    if (callback) {
      callback();
    }
  }
};

Client.prototype.__clear_ping_interval = function () {
  if (this.__ping_interval) {
    clearInterval(this.__ping_interval);
    delete this.__ping_interval;
  }
};

Client.prototype.__test_local_connection = function (cb) {
  var client = net.connect(this.config.local_server.port, this.config.local_server.host, function() {
    client.end();
  });
  client.once('error', cb);
  client.once('end', cb);
};

Client.prototype.__setup_master = function (cb) {
  var self = this;

  var socket = self.socket = net.connect(self.config.remote_server.port, self.config.remote_server.host);

  socket.on('error', cb);

  socket.on('connect', function () {
    logger.debug('Connected to %s:%d', self.config.remote_server.host, self.config.remote_server.port);
    logger.log('Connection estabilished.\n%s.%s <-> %s:%d', self.uuid, self.config.remote_server.host, self.config.local_server.host, self.config.local_server.port);

    socket.removeListener('error', cb);

    var timer = setTimeout(function() {
      logger.log('Server does not respond');
      self.close(cb.bind(cb, new Error('Server does not respond')));
    }, 1000);

    socket.once('data', function (data) {
      clearTimeout(timer);

      var body;
      try {
        body = JSON.parse(data.toString());
      } catch (e) {

      }
      if (!body || !body.ok) {
        return self.close(cb.bind(cb, new Error('Connection was closed by server')));
      }

      var interval = self.__ping_interval = setInterval(function () {
        logger.debug('Sending ping request to server');

        socket.once('data', function (data) {
          logger.debug('Ping response: ' + data.toString());
          if (data.toString() !== 'pong') {
            logger.error('Invalid ping response');
          }
        });

        socket.write('ping');
      }, 5000);

      return cb(null, socket);
    });

    socket.on('close', function (hadErr) {
      if (hadErr) {
        logger.error('Connection was unexpectedly closed');
      }
    });

    socket.write(JSON.stringify({uuid: self.uuid}));
  });
};

Client.prototype.__setup_socket_pool = function (cb) {
  var self = this;

  for (var i = 0; i < self.config.pool_size; i++) {
    self.__create_pool_connection();
  }
};

Client.prototype.__create_pool_connection = function () {
  var self = this;

  var remote_socket = net.connect(self.config.remote_server.port, self.config.remote_server.host);

  var index = self.pool.push(remote_socket);

  remote_socket.on('connect', function () {
    logger.debug('New connection to %s:%d was added to pool', self.config.remote_server.host, self.config.remote_server.port);
    remote_socket.once('data', function (data) {
      self.pool.splice(index - 1, 1);
      remote_socket.pause();
      logger.debug('Incoming message: ', data.toString());

      self.__create_pool_connection();

      var local_socket = net.connect(self.config.local_server.port, self.config.local_server.host);

      local_socket.on('connect', function() {
        logger.debug('New connection to %s:%s estabilished', self.config.local_server.host, self.config.local_server.port);

        var host_transform = new Transform();
        host_transform._transform = self.__rewrite_host.bind(self);

        self.__rewrite_host(data, null, function (err, data) {
          local_socket.write(data);
          remote_socket.pipe(host_transform).pipe(local_socket);
          local_socket.pipe(remote_socket);
        });

      });
      function cleanUp () {
        logger.debug('Close active connection');
        local_socket.end();
        remote_socket.end();
        self.removeListener('close', cleanUp);
      }
      local_socket.on('error', function (e) {
        logger.error('Error in local connection', e);
        cleanUp();
      });
      remote_socket.on('error', function (e) {
        logger.error('Error in remote connection', e);
        cleanUp()
      });
      local_socket.on('close', cleanUp);
      remote_socket.on('close', cleanUp);
      self.on('close', cleanUp);
    });

    remote_socket.write(JSON.stringify({uuid: self.uuid}));
  });
};

Client.prototype.__rewrite_host = function (chunk, enc, cb) {
  var self = this;

  if (!self.config.rewrite_host) {
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
        var new_line = 'Host: ' + self.config.rewrite_host;
        if (port && Number(port)) {
          new_line += ':' + port;
        }
        logger.debug('Rewrited %s to %s', line, new_line);
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
    logger.error(e, e.stack);
    return cb(null, chunk);
  }
};

module.exports = Client;