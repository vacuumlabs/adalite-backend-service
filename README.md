# Deprecation notice

*This repo is no longer maintained and further development has been moved to a private repository. In case of interest please contact us at adalite@vacuumlabs.com*

Also please consider using [cardano-graphql](https://github.com/input-output-hk/cardano-graphql) or [cardano-rosetta](https://github.com/input-output-hk/cardano-rosetta) instead. 

# AdaLite Backend Service


[![CircleCI](https://circleci.com/gh/vacuumlabs/adalite-backend-service.svg?style=svg)](https://circleci.com/gh/vacuumlabs/adalite-backend-service)

AdaLite Backend Service is based on Project Icarus by IOHK and used by the [AdaLite](https://github.com/vacuumlabs/adalite) wallet.

# Setup

## Pre-requisites

* NodeJS v8.9.4. We recommend [nvm](https://github.com/creationix/nvm) to install it
* [Postgres](https://www.postgresql.org/) as DB engine.
* [Cardano-rest](https://github.com/input-output-hk/cardano-rest) components
  * [Cardano-db-sync](https://github.com/input-output-hk/cardano-db-sync) with the extension of [tx bodies](https://github.com/mebassett/cardano-db-sync/pull/1) for pushing data to the database
  * [Cardano-node](https://github.com/input-output-hk/cardano-node) for acquiring blocks from blockchain
  * Cardano-submit-api for sending transactions

## Configuration

All the environment specific configurations can be found in `$PROJ_ROOT/config` folder.
They are loaded using [config](https://www.npmjs.com/package/config) package.

## Development environment

1.  Clone this repo, `git@github.com:vacuumlabs/adalite-backend-service.git`
2.  Select correct NodeJs version, `nvm use`
3.  Install dependencies, `yarn install`
4.  Transpile the source code, `yarn build`
5.  Start the app, `yarn start`.

To start cardano-rest services:

1. Create a `~/docker/.env` and set its variables showed in `~/docker/.example.env`
2. Create a copy of `~/docker/mainnet-topology.json.example` and name it `mainnet-topology.json`. By editing `mainnet-topology.json`, you can add custom relay nodes to your topology.
3. Execute `COMPOSE_PROJECT_NAME=<custom_prefix_to_container_names> docker-compose up`

Note that this starts adalite-backend-service as well, so you can run `docker container stop <adalite-backend-service-container-id>` to stop the backend service running in docker and follow the next steps to start it in console environment.

In order to connect to cardano-rest from local environment, you need to:

1.  Create a `~/.env` file with the necessary environment variables set. E.g.:

```
DB_USER=cexplorer
DB_HOST=dbHost
DB=dbName
DB_PASSWORD=password
DB_PORT=5432
SUBMIT_API_URL=<link to your cardano-submit-api>
```
2.  Go to the repository's path
3.  Execute the following command: `yarn start`

## Production environment
Docker-compose can be used to run postgres, Cardano rest components and the backend service in an isolated environment and to run multiple instances on the same host. 
In order to start a production instance, you need to:

1. Create a config based on `docker/env.example`, choose an instance name and name it `docker/.env.<instance_name>`
2. Create a copy of `~/docker/mainnet-topology.json.example` and name it `mainnet-topology.json`. By editing `mainnet-topology.json`, you can add custom relay nodes to your topology.
3. Run the interactive script `./manage_containers.sh <instance_name> <action>` from within the `docker` folder. Available actions are `start` - rebuilds and starts the instance, `stop` stops the instance

If you are running the instance for the first time on Ubuntu, you may run into file permission problems, since the volumes will probably be owned by root. To fix this, cd into the instance persistent storage folder (`$DATA_PATH` environment variable) and run `sudo chown -R 999:999 .` and restart the containers.

## Slack integration

A healthcheck script is used to guarantee that the database contains the latest data. If the database stops updating, the backend service will stop responding to requests and a message will be sent to Slack. The following environment variables need to be set:
```
SLACK_TOKEN=slackToken
SLACK_CHANNEL=slackChannel
```

## Checks & Tests

### Flow and Eslint

* Flow checks: `yarn flow`
* Eslint checks: `yarn eslint`

### Unit tests

To run unit tests, you just need to run

`yarn unit-tests`

### Integration tests

Integration tests will:

1. Create a new DB
2. Preload sample data
3. Startup the application
4. Exercise and assert several endpoints

To do so, before running them, you need to be sure a PostgreSQL db instance is accessible from localhost
using the config saved in `~/config/test.js`, which is by default:

* Server: localhost
* User: postgres
* Password: mysecretpassword
* Port: 5432

Then, run `yarn integration-tests`

### Coverage

To run both unit and integration tests, execute `yarn coverage`

## License

Licensed under the [Apache License, Version 2.0](LICENSE.md)
