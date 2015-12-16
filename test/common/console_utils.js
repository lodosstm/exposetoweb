var util = require('util');


var start_time;
var offset = 4;

function write_progress (current, total) {
  var cols = process.stdout.columns - 2 * offset - 2;
  function write () {
    console.log(Array(~~(current / total * cols)).join('=') + '>');
    var percent_str = util.format('%d/%d (%d%)', current, total, ~~(current / total * 100));

    var seconds_passed = (Date.now() - start_time) / 1000;
    var seconds_left = seconds_passed / current * (total - current) + 1

    var seconds_str = util.format('%ds left', ~~seconds_left);
    var str = percent_str + Array(cols - percent_str.length - seconds_str.length).join(' ') + seconds_str;
    process.stdout.moveCursor(offset);
    console.log(str);
  }
  if (current === 1) {
    process.stdout.moveCursor(offset);
    start_time = Date.now();
  } else {
    process.stdout.moveCursor(offset, -2);
    process.stdout.clearLine();
  }
  write();
  if (current === total) {
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine();
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine();
  }
}

exports.write_progress = write_progress;