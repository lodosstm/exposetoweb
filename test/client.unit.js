var fs          = require('fs');
var net         = require('net');
var util        = require('util');
var sinon       = require('sinon');
var should      = require('should');
var stream      = require('stream');

var exposetoweb = require('../lib');
var Client      = require('../lib/client');
var config      = require('../lib/default_settings');

var FakeSocket  = require('./common/fake_socket');

var client;

describe('Client', function () {
  it('lib should exports function that takes config and returns instance of Client', function () {
    (client = exposetoweb()).should.be.instanceOf(Client);
  });

  it('created client should have settings equals default_settings', function () {
    client.config.should.be.deepEqual(config);
  });

  it('created client should have uid', function () {
    var stored_uid = fs.readFileSync(client.config.uuid_file).toString();
    client.uuid.should.be.equal(stored_uid);
  });


  describe('__test_local_connection method', function () {
    beforeEach(function () {
      var self = this;

      this.net_stub = sinon.stub(net, 'connect', function (port, host, cb) {
        var socket = self.socket = new FakeSocket(cb);
        return socket;
      });
    });

    it('should try to create socket to local server', function () {
      client.__test_local_connection(function () {});
      this.socket.connect();

      this.net_stub.calledOnce.should.be.true();
      this.net_stub.firstCall.args.slice(0, 2).should.be.eql([
        client.config.local_server.port,
        client.config.local_server.host
      ]);
    });

    it('should successfully connect to local server', function () {
      var callback = sinon.stub();

      client.__test_local_connection(callback);
      this.socket.connect();

      callback.firstCall.args.should.be.eql([]);
    });

    it('should return error if connection fails', function () {
      var callback = sinon.stub();
      var error = new Error('test err');

      client.__test_local_connection(callback);
      this.socket.error(error);

      callback.calledOnce.should.be.true();
      callback.firstCall.args[0].should.be.deepEqual(error);
    });

    afterEach(function () {
      this.net_stub.restore();
    });
  });

  describe('__setup_master method', function () {
    beforeEach(function () {
      var self = this;
      var socket = self.socket = new FakeSocket();

      this.net_stub = sinon.stub(net, 'connect', function (port, host, cb) {
        if (cb) {
          cb(socket);
        }
        return socket;
      });

      this.clock = sinon.useFakeTimers();
    });

    it('should try to create socket to remote server', function () {
      client.__setup_master(function () {});
      this.socket.connect();

      this.net_stub.calledOnce.should.be.true();
      this.net_stub.firstCall.args.slice(0, 2).should.be.eql([
        client.config.remote_server.port,
        client.config.remote_server.host
      ]);
    });

    it('should write uid to socket after connect', function () {
      var callback = sinon.stub();
      this.socket.on('fake_write', callback);

      client.__setup_master(function () {});
      this.socket.connect();

      callback.calledOnce.should.be.true();
      var data = callback.firstCall.args[0];
      data.should.be.a.String();

      var body;
      try {
        body = JSON.parse(data);
      } catch (e) {}

      should.exists(body);
      body.should.be.an.Object();
      body.should.have.keys(['uuid']);
      body.uuid.should.be.equal(client.uuid);
    });

    it('should return error if server did not respond after 1000ms', function () {
      var callback = sinon.stub();

      client.__setup_master(callback);

      this.socket.connect();
      this.clock.tick(1010);

      callback.calledOnce.should.be.true();
      var error = callback.firstCall.args[0];
      should.exists(error);
      error.should.be.an.Error();
      error.message.should.be.equal('Server does not respond');
    });

    it('should not return error if server respond with {ok: true}', function () {
      var callback = sinon.stub();

      client.__setup_master(callback);

      this.socket.connect();
      this.socket.data(JSON.stringify({ok: true}));
      this.clock.tick(1010);

      callback.calledOnce.should.be.true();
      var error = callback.firstCall.args[0];
      should.not.exists(error);
    });

    it('should return error if server respond with {ok: false}', function () {
      var callback = sinon.stub();

      client.__setup_master(callback);

      this.socket.connect();
      this.socket.data(JSON.stringify({ok: false}));

      callback.calledOnce.should.be.true();
      var error = callback.firstCall.args[0];
      should.exists(error);
      error.should.be.an.Error();
      error.message.should.be.equal('Connection was closed by server');
    });

    it('should send ping after 5000ms', function () {
      var callback = sinon.stub();

      client.__setup_master(function () {});

      this.socket.connect();
      this.socket.data(JSON.stringify({ok: true}));
      this.socket.on('fake_write', callback);

      this.clock.tick(5500);

      callback.calledOnce.should.be.true();
      callback.firstCall.args[0].should.be.equal('ping');
    });

    afterEach(function () {
      this.net_stub.restore();
      this.clock.restore();
    });
  });

  describe('__rewrite_host method', function () {
    it('should not rewrite anything because rewriting disabled in config', function () {
      var callback = sinon.stub();
      client.config.rewrite_host = false;

      var str = [
        'GET / HTTP/1.1',
        'Host: localhost',
        '',
        ''
      ].join('\r\n');

      client.__rewrite_host(new Buffer(str, 'utf-8'), null, callback);

      callback.calledOnce.should.be.true();
      should.not.exists(callback.firstCall.args[0]);
      var rewrited_str = callback.firstCall.args[1].toString();
      rewrited_str.should.be.equal(str);
    });

    it('should not rewrite anything because str is not http header', function () {
      var callback = sinon.stub();
      client.config.rewrite_host = 'my.host.com';

      var str = [
        '1',
        '2',
        '3',
        '4'
      ].join('\r\n');

      client.__rewrite_host(new Buffer(str, 'utf-8'), null, callback);

      callback.calledOnce.should.be.true();
      should.not.exists(callback.firstCall.args[0]);
      var rewrited_str = callback.firstCall.args[1].toString();
      rewrited_str.should.be.equal(str);
    });

    it('should rewrite "Host" header in str', function () {
      var callback = sinon.stub();
      var host = 'localhost';
      client.config.rewrite_host = 'my.host.com';

      var str = [
        'GET / HTTP/1.1',
        'Host: ' + host,
        '',
        ''
      ].join('\r\n');

      client.__rewrite_host(new Buffer(str, 'utf-8'), null, callback);

      callback.calledOnce.should.be.true();
      should.not.exists(callback.firstCall.args[0]);
      var rewrited_str = callback.firstCall.args[1].toString();
      rewrited_str.should.not.be.equal(str);

      var host_header = rewrited_str.split('\r\n')[1];
      should.exists(host_header);
      host_header.should.be.equal(str.split('\r\n')[1].replace(host, client.config.rewrite_host));
    });
  });

  describe('connect method', function () {
    it('client should test local connection before connect', function () {
      var stub = sinon.stub(client, '__test_local_connection');

      client.connect();

      stub.calledOnce.should.be.true();
      stub.restore();
    });

    it('connection should fails if client can not connect to local server', function () {
      var callback = sinon.stub();
      var stub = sinon.stub(client, '__test_local_connection', function (cb) {
        cb.should.be.a.Function();
        cb(true);
      });

      client.connect(callback);

      client.connected.should.be.false();
      stub.calledOnce.should.be.true();
      callback.calledOnce.should.be.true();

      var error = callback.firstCall.args[0];
      should.exists(error);
      error.should.be.an.Error();

      stub.restore();
    });

    it('client should call close method when connection fails', function () {
      var callback = sinon.stub();
      var test_stub = sinon.stub(client, '__test_local_connection', function (cb) {
        cb.should.be.a.Function();
        cb(true);
      });
      var cleanup_stub = sinon.stub(client, 'close', function (cb) {
        cb();
      });

      client.connect(callback);

      callback.calledOnce.should.be.true();
      test_stub.calledOnce.should.be.true();
      cleanup_stub.calledOnce.should.be.true();

      var error = callback.firstCall.args[0];
      error.should.be.an.Error();
      client.connected.should.be.false();

      test_stub.restore();
      cleanup_stub.restore();
    });
  });

  describe('close method', function () {
    it('should clear ping interval', function () {
      var clear_ping = sinon.stub(client, '__clear_ping_interval');

      client.close();

      clear_ping.calledOnce.should.be.true();
    });

    it('should close master socket', function () {
      var socket = new FakeSocket();

      client.socket = socket;

      client.close();

      client.closed.should.be.true();
      socket.closed.should.be.true();
    });

    // it('should close all sockets', function () {
    //   var socket = new FakeSocket();
    //   client.pool.push(socket);
    //
    //   client.close();
    //
    //   client.pool.length.should.be.equal(0);
    //   socket.closed.should.be.true();
    // });
  });
});


describe('Net errors emulation', function () {
  beforeEach(function () {
    var self = this;

    self.client = exposetoweb({pool_size: 1});
    self.sockets = [];

    self.net_stub = sinon.stub(net, 'connect', function (port, host, cb) {
      var socket = new FakeSocket(cb);
      socket.host = host;
      socket.port = port;
      self.sockets.push(socket);
      return socket;
    });
  });

  it('Should try to connect with timeout error in master socket', function () {
    var local_test_socket, master_socket, pool;
    var callback = sinon.stub();
    var error = new Error('connect ETIMEDOUT 46.101.13.126:5000');

    this.client.connect(callback);
    local_test_socket = this.sockets[0];
    local_test_socket.connect();

    master_socket = this.sockets[1];
    master_socket.error(error);

    callback.calledOnce.should.be.true();
    callback.firstCall.args[0].should.be.eql(error);
  });

  it('Should try to reconnect when error in master socket happens after successful connection', function () {
    var error = new Error('connect ETIMEDOUT 46.101.13.126:5000');

    this.client.connect();
    var local_test_socket = this.sockets[0];
    local_test_socket.connect();

    var close_stub = sinon.stub(this.client, 'close', function (cb) {
      should.exists(cb);
      cb.should.be.a.Function();
      return cb();
    });
    var connect_stub = sinon.stub(this.client, 'connect');

    var master_socket = this.sockets[1];
    master_socket.connect();
    master_socket.data(JSON.stringify({ok: true}));
    master_socket.error(error);

    close_stub.calledOnce.should.be.true();
    connect_stub.calledOnce.should.be.true();
  });

  afterEach(function (done) {
    this.net_stub.restore();
    if (this.client.connected) {
      this.client.close(done);
    } else {
      done();
    }
  });
});
