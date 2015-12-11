var _           = require('lodash');

var Client      = require('./client');

var default_settings = require('./default_settings');

module.exports = function (config) {
  var settings = _.clone(default_settings);
  if (config) {
    if (config.local_server) {
      _.extend(settings.local_server, config.local_server);
    }
    if (config.remote_server) {
      _.extend(settings.remote_server, config.remote_server);
    }
    _.extend(settings, _.pick(config, ['pool_size', 'uuid_file', 'debug', 'rewrite_host', 'cli']));
  }

  return new Client(settings);
}