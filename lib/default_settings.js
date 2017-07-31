var path = require('path');

module.exports = default_settings = {
  local_server: {
    host: 'localhost',
    port: 3001
  },
  remote_server: {
    host: 'proxy.lodoss.org',
    port: 5000
  },
  uuid_file: path.resolve(process.env.HOME, '.exposetoweb_uuid'),
  debug: false,
  rewrite_host: null,
  cli: false
};
