var util    = require('util');
var http    = require('http');
var should  = require('should');
var request = require('request');

var random  = require('./common/random');
var console_utils = require('./common/console_utils');

var client = require('../lib')();

var obj       = random.obj(3000);
var postData  = JSON.stringify(obj);

var requests_count = 1000;
var concurency = 300;

describe('Client', function () {
  before(function (done) {
    var self = this;

    self.requests = [];

    for (var i = 0; i < requests_count; i++) {
      self.requests.push(random.obj(3000));
    }

    self.server = http.createServer();
    self.server.on('request', function (req, res) {
      var data = '';

      req.on('data', function(chunk) {
        data += chunk.toString();
      });
      req.on('end', function () {
        res.writeHead(200, "OK", {received: true});
        res.write(data);
        res.end();
      });
    });
    
    self.server.listen(3001, '127.0.0.1', done);
  });

  it('should be not connected', function () {
    client.connected.should.be.false();
    client.closed.should.be.false();
  });

  it('should successfully connect', function (done) {
    var self = this;

    client.connect(function (err, url) {
      should.not.exists(err);
      
      should.exists(url);
      url.should.be.equal(util.format('%s.%s', client.uuid, client.config.remote_server.host));
      self.url = url;

      done();
    });
  });

  it('should make ' + requests_count + ' requests', function (done) {
    this.timeout(requests_count / 10 * 1000); //ms
    var self = this;

    var res_count = 0;

    function send (req) {
      request.post({
        url: 'http://' + self.url,
        json: req
      }, function (err, res, body) {
        if (err || !body || res.statusCode !== 200) {
          console.error(err, body);
          return send(req);
        }

        console_utils.write_progress(++res_count, requests_count);

        should.not.exists(err);
        should.exists(body);
        res.statusCode.should.equal(200);

        should.exists(body);
        body.should.be.eql(req);

        var req_data;
        if (req_data = self.requests.shift()) {
          send(req_data);
        } else {
          if (res_count === requests_count) {
            done();
          }
        }
      });
    }

    for (var i = 0; i < concurency; i++) {
      send(self.requests.shift());
    }
  });

  after(function (done) {
    var self = this;

    client.close(function () {
      client.closed.should.be.true();
      client.connected.should.be.false();

      self.server.close(function () {
        done();
      });
    });
  });
});



//     var req = http.request({
//       hostname: url,
//       headers: {
//         'Content-Type': 'application/json',
//         'Content-Length': postData.length
//       }
//     }, function (res) {
//       assert.strictEqual(res.statusCode, 200, 'Server should response with 200 OK');
//       assert.strictEqual(res.headers.received, 'true', 'Server should send "Received: true" header');

//       var body = '';
//       res.on('data', function(chunk) {
//         body += chunk.toString();
//       });
//       res.on('end', function () {
//         assert.strictEqual(body, postData);
//         server.close();
//         client.close(function () {
//           assert.strictEqual(client.connected, false, 'Client should be disconnected');
//           assert.strictEqual(client.closed, true, 'Client should be closed');
//         });
//       });
//     });

//     req.write(postData);
//     req.end();
//   });
// });
