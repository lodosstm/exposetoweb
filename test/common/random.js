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

exports.str = randomStr;
exports.obj = randomObj;