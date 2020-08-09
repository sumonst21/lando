# Pantheon Development Guide

This guide contains information to help onboard developers to work on the [Pantheon](https://pantheon.io) integration, hereafter referred to as "the plugin".

After reading through it the developer should understand:

* The high level goals of the integration
* How the plugin is structured
* How the plugin emulates the Pantheon lifecycle
* How the plugin deviates from the Pantheon lifecycle
* How additional services/application containers are added
* How additional tooling is added
* How the project is tested
* Where framework level overrides live
* Contributing code

It may also be valuable to review the [user documentation](https://docs.lando.dev/config/pantheon.html) for this integration as that provides a bit of a Specification as Documentation.

## Overview

The high level goals of the integration are straightforward:

### 1. Use Pantheon images

This allow users to run their Pantheon projects locally using the same images, build processes, configuration, etc as they do on Pantheon itself. This means that a Landofile using the `pantheon` recipe can be be something simple like this:

```yaml
name: landobot-drupal7
recipe: pantheon
config:
  framework: drupal
  site: landobot-drupal7
  id: 6e8d4bb2-dd6f-4640-9d12-d95a942c34ca
```

The implication here is that Lando will instead look and use the Pantheon configuration files instead of its own mechanisms. You can, however, still use the Landofile for additional power you may need exclusively in the local context.

### 2. Interact with the remote Pantheon environment

Similarly to our other hosting integrations the user should be able to do _something like_ the following:

```bash
# Authenticate against Pantheon and clone down a project
lando init --source pantheon

# Pull down the code, database and files from the dev environment
lando pull --code dev --database dev --files dev
# Optionally use rsync
lando pull --code dev --database dev --files dev -rsync

# Push up the database and files to the dev environment
lando push --code dev --database dev --files dev
```

### 3.Provide relevant tooling commands

Provide access to the `terminus` CLI and other contextually relevant commands.

```bash
# Run pantheon cli commands
lando terminus

# Run other php things
lando php
lando composer

# Run framework specific commands
lando drush
lando wp
```

### 4. Get all the other built-in benefits of Lando

RTFM if you need more info on dat.

## Project Structure

This plugin follows the same structure as any [Lando plugin](https://docs.lando.dev/contrib/contrib-plugins.html#plugins) but here is an explicit breakdown:

```bash
./
|-- lib             Utilities and helpers, things that can easily be unit tested
|-- recipes
    |-- pantheon    The files to define the `pantheon` recipe and its `init` command
|-- scripts         Helpers scripts that end up /helpers/ inside each container
|-- services        Defines each Pantheon service eg `redis` or `appserver`
|-- test            Unit tests
|-- types           Defines the type/parent each above service can be
|-- app.js          Modifications to the app runtime
|-- index.js        Modifications to the Lando runtime
```

## Services and Types

Inside of the `services` folder you will see where we define the Lando service that corresponds to each pantheon application container and service. Each service can either be a `pantheon-appserver` or a `pantheon-service` and each of these are defined in the `types` folder.

A `pantheon-appserver` is basically the `php` runtime.

A `pantheon-service` is any non-runtime eg database, cache, index, etc.

If you want to add support for a new pantheon service or application container simply add a new one into the `services` folder and make sure you set the `parent` to either `_pantheon_service` or `_pantheon_appserver` as appropriate.

## Getting started

It's easiest to develop by spinnning up one of our Pantheon examples:

* [Drupal 7](https://github.com/lando/lando/tree/master/examples/pantheon-drupal7)
* [Drupal 8](https://github.com/lando/lando/tree/master/examples/pantheon-drupal8)
* [WordPress](https://github.com/lando/lando/tree/master/examples/pantheon-wordpress)

## Other considerations

Here are a few other useful things to know.

Also recommend reviewing the [Known issues and caveats](https://docs.lando.dev/config/pantheon.html#caveats-and-known-issues) in the user documentation.

## Testing

Its best to familiarize yourself with how Lando [does testing](https://docs.lando.dev/contrib/contrib-testing.html) in general before proceeding.

### Unit Tests

Generally, unit testable code should be placed in `lib` and then the associated test in `tests` in the form `FILE-BEING-TESTED.spec.js`. Here is an example:


```bash
./
|-- lib
    |-- stuff.js
|-- test
    |-- stuff.spec.js
```

These tests can then be run with `yarn test:unit`.

### Func Tests

Func tests are made by just adding more entries to each examples README. This uses our made-just-for-Lando testing framework [Leia](https://github.com/lando/leia). See below for our current Pantheon tests:

* [Drupal 8](https://github.com/lando/lando/tree/master/examples/pantheon-drupal8)
* [Kitchen Sink](https://github.com/lando/lando/tree/master/examples/pantheon-kitchensink)

These are then run by CircleCI. While you _can_ run all the func test locally this can take a LONG time. If you decide you want to do that we recommend you generate the test files and then invoke the tests for just one example.

```bash
# Generate tests
yarn generate-tests

# Run a single examples tests
yarn mocha --timeout 900000 test/pantheon-sh-drupal-8-example.func.js
```

## Contribution

WIP but outline is

1. GitHub flow as normal eg branch for an issue -> PR -> merge
2. Lets review all pantheon PRs together for awhile: this should keep us on the same page and also force knowledge transfer
3. Lets definitely be updating the user docs/dev docs
4. Once we have the d8 and kitchen sink example func tests lets also be adding tests on every commit
5. Lets wait on unit tests until things settle down a bit but a good rule of thumb is try to put things we would want to unit tests in `lib` somewhere.
