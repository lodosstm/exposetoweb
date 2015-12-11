var util    = require('util');
var http    = require('http');
var assert  = require('assert');

var client = require('../lib')();

function randomStr (size) {
  var str = '';
  var a = 'A'.charCodeAt(0);
  var z = 'Z'.charCodeAt(0);
  while (str.length < size) {
    str += String.fromCharCode(Math.random() * (z - a + 1) + a);
  }
  return str;
}

function randomObj (size) {
  var obj = {};
  while (JSON.stringify(obj).length < size) {
    var len = Math.random() * size / 10;
    obj[randomStr(10)] = ~~(Math.random() * 2) % 2 === 0 ? randomStr(len) : randomObj(len);
  }
  return obj;
}

var obj       = randomObj(3000);
var postData  = JSON.stringify(obj);

var server = http.createServer();

server.on('request', function (req, res) {
  var body = '';
  console.log(req);
  req.on('data', function(chunk) {
    body += chunk.toString();
  });
  req.on('end', function () {
    assert.strictEqual(body, postData);
    res.writeHead(200, "OK", {received: true});
    res.write(body);
    res.end();
  });
});

assert.strictEqual(client.connected, false, 'Client should be disconnected');
assert.strictEqual(client.closed, false, 'Client should not be closed');

server.listen(3001, '127.0.0.1', function () {
  client.connect(function (err, url) {
    assert.strictEqual(client.connected, true, 'Client should be connected');
    assert.strictEqual(err, null, 'Client should connect without errors');
    assert.strictEqual(url, util.format('%s.%s', client.uuid, client.config.remote_server.host), 'Client should return valid connection url');
    assert.strictEqual(client.closed, false, 'Client should not be closed');

    var req = http.request({
      hostname: url,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    }, function (res) {
      assert.strictEqual(res.statusCode, 200, 'Server should response with 200 OK');
      assert.strictEqual(res.headers.received, 'true', 'Server should send "Received: true" header');

      var body = '';
      res.on('data', function(chunk) {
        body += chunk.toString();
      });
      res.on('end', function () {
        assert.strictEqual(body, postData);
        server.close();
        client.close(function () {
          assert.strictEqual(client.connected, false, 'Client should be disconnected');
          assert.strictEqual(client.closed, true, 'Client should be closed');
        });
      });
    });

    req.write(postData);
    req.end();
  });
});
