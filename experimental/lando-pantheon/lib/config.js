'use strict';

// Modules
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const utils = require('./utils');
const yaml = require('js-yaml');

// Pressflow and backdrop database settings
const pantheonDatabases = {
  default: {
    default: {
      driver: 'mysql',
      prefix: '',
      database: 'pantheon',
      username: 'pantheon',
      password: 'pantheon',
      host: 'database',
      port: 3306,
    },
  },
};

/*
 * Helper to get defaults
 * @TODO: this should get defaults
 * @NOTE: this may be framework specific
 */
const getDefaults = config => config;

/*
 * Helper to get filemount by framework
 */
const getFilemount = framework => {
  switch (framework) {
    case 'backdrop': return 'files';
    case 'drupal': return 'sites/default/files';
    case 'drupal8': return 'sites/default/files';
    case 'drupal9': return 'sites/default/files';
    case 'wordpress': return 'wp-content/uploads';
    case 'wordpress_network': return 'wp-content/uploads';
    default: return 'sites/default/files';
  }
};

/*
 * Helper to get pantheon settings
 */
const getSettings = ({id}) => ({
  databases: pantheonDatabases,
  conf: {
    'pressflow_smart_start': true,
    'pantheon_binding': 'lando',
    'pantheon_site_uuid': id,
    'pantheon_environment': 'lando',
    'pantheon_tier': 'lando',
    'pantheon_index_host': 'index',
    'pantheon_index_port': 449,
    'redis_client_host': 'cache',
    'redis_client_port': 6379,
    'redis_client_password': '',
    'file_public_path': 'sites/default/files',
    'file_private_path': 'sites/default/files/private',
    'file_directory_path': 'sites/default/files',
    'file_temporary_path': '/tmp',
    'file_directory_temp': '/tmp',
    'css_gzip_compression': false,
    'js_gzip_compression': false,
    'page_compression': false,
  },
  drupal_hash_salt: utils.getHash(JSON.stringify(pantheonDatabases)),
  config_directory_name: 'config',
});

/*
 * We wordpress or what?
 */
const isWordPressy = framework => {
  return ['wordpress', 'wordpress_network'].includes(framework);
};

/*
 * Get the appserver config
 */
exports.getAppserver = config => ({
  name: 'appserver',
  type: 'pantheon-appserver',
  application: true,
  version: config.php,
  pantheon: _.omit(config, ['appserver']),
});

/*
 * Get the services config
 */
exports.getServices = ({cache = true, edge = true, index = true} = {}) => {
  // Get the defaults eg the database
  const services = [{name: 'database', type: 'pantheon-database'}];
  // Add the aux services as we can
  if (cache) services.push({name: 'cache', type: 'pantheon-cache'});
  if (edge) services.push({name: 'edge', type: 'pantheon-edge'});
  if (index) services.push({name: 'index', type: 'pantheon-index'});
  // Send back
  return services;
};

/*
 * Helper to merge in pantheon yamls
 */
exports.loadConfigFiles = (baseDir, files = ['pantheon.upstream.yml', 'pantheon.yml']) => _(files)
  .map(file => path.join(baseDir, file))
  .filter(file => fs.existsSync(file))
  .map(file => yaml.safeLoad(fs.readFileSync(file)))
  .thru(data => _.merge({}, ...data))
  .thru(data => {
    // Set the php version
    // @TODO: what is the best version here?
    data.php = _.toString(_.get(data, 'php_version', '5.6'));
    // Set the webroot
    data.webroot = (_.get(data, 'web_docroot', false)) ? 'web' : '.';
    // Set the drush version
    data.drush = _.toString(_.get(data, 'drush_version', '8'));
    // if drush version is less than 8, use 8 anyway
    if (data.drush < 8) data.drush = 8;
    // Normalize because 7.0 right away gets handled strangely by js-yaml
    if (data.php === '7' || data.php === 7) data.php = '7.0';
    // return
    return data;
  })
  .value();

/*
 * Get defaults and operate based on what we know
 * we need some sort of
 */
exports.parseConfig = config => _.merge({}, getDefaults(config.config), {
  filemount: getFilemount(config.framework),
  isDrupaly: !isWordPressy(config.framework),
  isWordPressy: isWordPressy(config.framework),
  pressflow: getSettings(config),
});
