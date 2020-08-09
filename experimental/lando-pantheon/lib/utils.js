'use strict';

// Modules
const _ = require('lodash');
const crypto = require('crypto');
const fs = require('fs');
const getDrush = require('./../../../plugins/lando-recipes/lib/utils').getDrush;
const getPhar = require('./../../../plugins/lando-recipes/lib/utils').getPhar;
const PantheonApiClient = require('./api');
const path = require('path');
const yaml = require('js-yaml');

// Constants
const DRUSH_VERSION = '8.3.5';
const BACKDRUSH_VERSION = '1.2.0';
const PANTHEON_CACHE_HOST = 'cache';
const PANTHEON_CACHE_PORT = '6379';
const PANTHEON_CACHE_PASSWORD = '';
const PANTHEON_INDEX_HOST = 'index';
const PANTHEON_INDEX_PORT = '449';
const PATH = [
  '/app/vendor/bin',
  '/usr/local/sbin',
  '/usr/local/bin',
  '/usr/sbin',
  '/usr/bin',
  '/sbin',
  '/bin',
  '/var/www/.composer/vendor/bin',
  '/srv/bin',
];

// Things
const backdrushUrl = `https://github.com/backdrop-contrib/drush/archive/${BACKDRUSH_VERSION}.tar.gz`;
const wpCliUrl = 'https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar';
const wpStatusCheck = ['php', '/usr/local/bin/wp', '--allow-root', '--info'];
const backdrushInstall = [
  'curl', '-fsSL', backdrushUrl, '|', 'tar', '-xz', '--strip-components=1', '-C', '/var/www/.drush', '&&',
  'drush', 'cc', 'drush',
].join(' ');

/*
 * Hash helper
 */
exports.getHash = u => crypto.createHash('sha256').update(u).digest('hex');

/*
 * Helper to get build steps
 */
exports.getPantheonBuildSteps = (framework, drush = 8) => {
  if (isWordPressy(framework)) {
    return [getPhar(wpCliUrl, '/tmp/wp-cli.phar', '/usr/local/bin/wp', wpStatusCheck)];
  } else {
    const build = [];
    // Figure out drush
    if (drush > 8) build.push(['composer', 'global', 'require', `drush/drush:^${drush}`]);
    else build.push(getDrush(DRUSH_VERSION));
    build.push(['drush', '--version']);
    // And then hit up other framework specific stuff
    if (framework === 'drupal8') {
      build.push(getPhar(
        'https://drupalconsole.com/installer',
        '/tmp/drupal.phar',
        '/usr/local/bin/drupal')
      );
    }
    if (framework === 'backdrop') {
      build.push(backdrushInstall);
    }
    return build;
  }
};

/*
 * Helper to build cache service
 */
exports.getPantheonCache = () => ({
  services: {
    cache: {
      type: 'redis:2.8',
      persist: true,
      portforward: true,
    },
  },
  tooling: {
    'redis-cli': {service: 'cache'},
  },
});

/*
 * Helper to build edge service
 */
exports.getPantheonEdge = options => ({
  proxyService: 'edge',
  services: {
    edge: {
      type: 'varnish:4.1',
      backends: ['appserver_nginx'],
      ssl: true,
      config: {vcl: path.join(options.confDest, 'pantheon.vcl')},
    },
  },
  tooling: {
    varnishadm: {service: 'edge', user: 'root'},
  },
});

/*
 * Helper to get pantheon envvars
 */
exports.getPantheonEnvironment = options => ({
  AUTH_KEY: exports.getHash(JSON.stringify(pantheonDatabases)),
  AUTH_SALT: exports.getHash(options.app + options.framework),
  BACKDROP_SETTINGS: JSON.stringify(getPantheonSettings(options)),
  CACHE_HOST: PANTHEON_CACHE_HOST,
  CACHE_PORT: PANTHEON_CACHE_PORT,
  CACHE_PASSWORD: PANTHEON_CACHE_PASSWORD,
  DB_HOST: 'database',
  DB_PORT: 3306,
  DB_USER: 'pantheon',
  DB_PASSWORD: 'pantheon',
  DB_NAME: 'pantheon',
  DOCROOT: '/',
  DRUPAL_HASH_SALT: exports.getHash(JSON.stringify(pantheonDatabases)),
  drush_version: options.drush_version,
  FRAMEWORK: options.framework,
  FILEMOUNT: getFilemount(options.framework),
  LOGGED_IN_KEY: exports.getHash(options.app),
  LOGGED_IN_SALT: exports.getHash(options.root + options.app),
  NONCE_SALT: exports.getHash(options.root + options.root),
  NONCE_KEY: exports.getHash(options.root + options.framework),
  PATH: PATH.join(':'),
  PANTHEON_ENVIRONMENT: 'lando',
  PANTHEON_INDEX_HOST: PANTHEON_INDEX_HOST,
  PANTHEON_INDEX_PORT: PANTHEON_INDEX_PORT,
  PANTHEON_SITE: options.id,
  PANTHEON_SITE_NAME: options.site,
  php_version: options.php_version,
  PRESSFLOW_SETTINGS: JSON.stringify(getPantheonSettings(options)),
  TERMINUS_ENV: 'dev',
  TERMINUS_HIDE_UPDATE_MESSAGE: 1,
  // TERMINUS_ORG: ''
  TERMINUS_SITE: options.site,
  TERMINUS_TOKEN: _.get(options, '_app.meta.token'),
  TERMINUS_USER: _.get(options, '_app.meta.email'),
  SECURE_AUTH_KEY: exports.getHash(options.app),
  SECURE_AUTH_SALT: exports.getHash(options.app + options.root),
});

/*
 * Helper to build index service
 */
exports.getPantheonIndex = () => ({
  services: {
    index: {
      type: 'solr:custom',
      overrides: {
        image: 'devwithlando/pantheon-index:3.6-3',
        ports: ['449'],
        command: '/bin/bash -c "/helpers/add-cert.sh && /start.sh"',
        environment: {
          LANDO_NO_USER_PERMS: 'NOTGONNAGOIT',
        },
      },
    },
  },
});

/*
 * Helper to build index service
 */
exports.getPantheonInquirerEnvs = (token, site, nopes = [], log = console.log) => {
  const api = new PantheonApiClient(token, log);
  return api.auth().then(() => api.getSiteEnvs(site)
  .map(env => ({name: env.id, value: env.id}))
  .filter(env => !_.includes(nopes, env.value))
  .then(envs => _.flatten([envs, [{name: 'none', value: 'none'}]])))
  .catch(err => {
    throw (_.has(err, 'response.data')) ? new Error(err.response.data) : err;
  });
};

/*
 * Helper to get tooling
 */
exports.getPantheonTooling = framework => {
  if (isWordPressy(framework)) return {wp: {service: 'appserver'}};
  else {
    const tooling = {drush: {service: 'appserver'}};
    if (framework === 'drupal8') {
      tooling.drupal = {service: 'appserver', description: 'Runs drupal console commands'};
    }
    return tooling;
  }
};

/*
 * Helper to get terminus tokens
 */
exports.getTerminusTokens = home => {
  if (fs.existsSync(path.join(home, '.terminus', 'cache', 'tokens'))) {
    return _(fs.readdirSync(path.join(home, '.terminus', 'cache', 'tokens')))
      .map(tokenFile => path.join(home, '.terminus', 'cache', 'tokens', tokenFile))
      .map(file => {
        try {
          return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (error) {
          throw Error(`The file ${file} is not valid JSON`);
        }
      })
      .value();
  } else {
    return [];
  }
};

/*
 * Helper to return most recent tokens
 */
exports.sortTokens = (...sources) => _(_.flatten([...sources]))
  .sortBy('date')
  .groupBy('email')
  .map(tokens => _.last(tokens))
  .value();
