'use strict';
// Modules
const _ = require('lodash');
const panconf = require('./lib/config');
const utils = require('./lib/utils');

// Only do this on pantheon recipes
module.exports = (app, lando) => {
  if (_.get(app, 'config.recipe') === 'pantheon') {
    // Reset the ID with the one from the lando config if possible
    app.id = _.get(app, 'config.config.id', app.id);
    app.log.debug('reset app id to %s', app.id);
    // Sanitize any pantheon auth
    app.log.alsoSanitize('pantheon-auth');

    // Start by loading in all the pantheon files we can
    app.pantheon = {config: panconf.loadConfigFiles(app.root)};

    // And then augment with a few other things
    app.pantheon.domain = `${app.name}.${app._config.domain}`;
    app.pantheon.framework = _.get(app, 'config.config.framework', 'drupal8');
    app.pantheon.id = app.id;
    app.pantheon.tokenCache = 'pantheon.tokens';
    app.log.silly('loaded pantheon config files', app.pantheon);

    /*
     * This event is intended to parse and interpret the pantheon config files
     * loaded above into things we can use elsewhere, eg if there is any useful
     * non-trivial data mutation that needs to happen ANYWHERE else in the
     * recipe it probably should happen here
     */
    app.events.on('pre-init', 1, () => {
      // Add tokens and other meta to our app
      const pantheonTokens = lando.cache.get(app.pantheon.tokenCache) || [];
      const terminusTokens = utils.getTerminusTokens(lando.config.home);
      // Combine our tokens and sort
      app.pantheon.tokens = utils.sortTokens(pantheonTokens, terminusTokens);
      app.log.verbose('found pantheon tokens %j', _.map(app.pantheon.tokens, 'email'));

      // Parse the config into useful stuff for downstream
      // to start with reasonable defaults
      app.pantheon = _.merge({}, app.pantheon, panconf.parseConfig(app.pantheon));

      // Merge user overrides over the pantheon settings
      // @TODO: we need to figure out good default values for pantheon.yaml stuff
      // @TODO: we need to document setting overrides via lando and get init
      // @NOTE: TBD on implementation here but it might be nice for lando
      // to set some "framework defaults" for local eg skip_permissions_hardening
      // on D8.
      //
      // This way we can explicitly set default overrides in a landofile instead of
      // sneakily doing it behind the scenes. Of course the user can subsequently
      // alter these as needed.
      app.pantheon.pressflow = _.merge({}, app.pantheon.pressflow, _.get(app, 'config.config.overrides', {}));

      // Use the above config to build the appserver
      app.pantheon.appserver = panconf.getAppserver(app.pantheon);
      // And get the services as well
      app.pantheon.services = panconf.getServices(_.get(app, 'config.config'));
    });


    /*
     * This event is intended to make sure we reset the active token and cache when it is passed in
     * via the lando pull or lando push commands
     */
    // Set the app caches, validate tokens and update token cache
    _.forEach(['pull', 'push', 'switch'], command => {
      app.events.on(`post-${command}`, (config, answers) => {
        // Only run if answer.auth is set, this allows these commands to all be
        // overriden without causing a failure here
        if (answers.auth) {
         const api = new PantheonApiClient(answers.auth, app.log);
          return api.auth().then(() => api.getUser().then(results => {
            const cache = {token: answers.auth, email: results.email, date: _.toInteger(_.now() / 1000)};
            // Reset this apps metacache
            lando.cache.set(app.metaCache, _.merge({}, app.meta, cache), {persist: true});
            // Set lando's store of pantheon machine tokens
            lando.cache.set(app.pantheonTokenCache, utils.sortTokens(app.pantheonTokens, [cache]), {persist: true});
            // Wipe out the apps tooling cache to reset with the new MT
            lando.cache.remove(`${app.name}.tooling.cache`);
          }))
          // Throw some sort of error
          // NOTE: this provides some error handling when we are completely non-interactive
          .catch(err => {
            throw (_.has(err, 'response.data')) ? new Error(err.response.data) : err;
          });
        }
      });
    });
  }
};
