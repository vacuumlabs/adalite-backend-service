#!/bin/bash

if [ "$1" == "" ]; then
  echo "instance name is missing"
  exit 1
fi

if [ "$2" != "start" ] && [ "$2" != "stop" ]; then
  echo "Action must be either start or stop"
  exit 1
fi

instance_name=$1
action=$2

set -e

cp .env.$instance_name .env

export COMPOSE_PROJECT_NAME=$instance_name

if [ $action != "stop" ]; then
  docker-compose build
fi

docker-compose down

if [ $action == "start" ]; then
  docker-compose up -d
fi

rm .env
