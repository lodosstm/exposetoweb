var util      = require('util');
var events    = require('events');
var Transform = require('stream').Transform;

function FakeSocket (onConnect) {
  if (onConnect) {
    this.on('connect', onConnect);
  }
  this.closed = false;
  this.pipes = [];
}

FakeSocket.prototype.connect = function (timeout) {
  if (timeout) {
    setTimeout(this.emit.bind(this, 'connect'), timeout);
  } else {
    this.emit('connect');
  }
};

FakeSocket.prototype.end = function () {
  if (!this.closed) {
    this.closed = true;
    this.pipes.splice(-this.pipes.length);
    this.emit('end');
    this.emit('close', false);
  }
};

FakeSocket.prototype.error = function (err) {
  err = err || new Error();
  this.emit('error', err);
};

FakeSocket.prototype.write = function (data) {
  this.emit('fake_write', data);
};

FakeSocket.prototype.data = function (data) {
  this.emit('data', data);
};

FakeSocket.prototype.unref = function () {
};

FakeSocket.prototype.pause = function () {
};

FakeSocket.prototype.pipe = function (socket) {
  this.pipes.push(socket);
  return this;
};

util.inherits(FakeSocket, events.EventEmitter);

module.exports = FakeSocket;