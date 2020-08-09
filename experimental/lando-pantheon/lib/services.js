'use strict';

// Modules
const _ = require('lodash');

/*
 * Helper to return a type and version from platform data
 */
const getPlatformServiceType = ({name = 'app', type} = {}) => ({
  name,
  type: _.first(type.split(':')),
  version: _.last(type.split(':')),
});

/*
 * Helper to map into a lando service
 */
const getLandoService = service => {
  // If this is an appserver then we need some more juice
  if (service.application) {
    // Add some magic to reset the web/app user
    service.build_as_root_internal = ['/helpers/psh-recreate-users.sh'];
    // We need to reeload our keys because in some situations they cannot be
    // set until now
    service.build_as_root_internal.push('/helpers/load-keys.sh --silent');
    // Add in the build wrapper
    // @NOTE: php applications need to run build steps after the OPEN step to
    // ensure any needed php extensions are installed. all other services should
    // run before since they may be needed to start up the app correctly
    if (lando.type === 'platformsh-php') {
      lando.run_internal = ['/helpers/psh-build.sh'];
    } else {
      lando.build_internal = ['/helpers/psh-build.sh'];
    }
  }
  // Return
  return service;
};

/*
 * Maps parsed platform config into related Lando things
 */
exports.getLandoServices = (services = []) => _(services)
  // Merge in other needed lando things
  .map(service => _.merge({}, getLandoService(service)))
  // Finally map to an object
  .map(service => ([service.name, service]))
  .fromPairs()
  .value();
