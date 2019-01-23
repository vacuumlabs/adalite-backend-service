// @flow

import delay from 'delay'
import { RTMClient } from '@slack/client'
import config from 'config'
import dbApi from './db-api'
import type { DbApi } from 'icarus-backend'; // eslint-disable-line

const { logger } = config.get('server')

async function fetchBestBlock(db) {
  return dbApi(db).bestBlock()
}

async function start(db: any) {
  logger.debug('start')
  const token = process.env.SLACK_TOKEN
  const channelId = process.env.SLACK_CHANNEL
  process.env.DATABASE_UNHEALTHY = 'false'
  const rtm = new RTMClient(token)
  rtm.start()

  let responding = true
  let bestBlock = await fetchBestBlock(db)

  while (true) { // eslint-disable-line
    await delay(70000) // eslint-disable-line
    const dbBestBlock = await fetchBestBlock(db) // eslint-disable-line
    const changed = !(bestBlock === dbBestBlock)

    if (responding !== changed) {
      // TODO: block number from the official explorer
      process.env.DATABASE_UNHEALTHY = responding.toString()
      responding = changed
      const message = changed ? 'Database is updating again.' : 'Database did not update!'
      logger.info(message)
      rtm.sendMessage(message, channelId)
        .then(() => {
          logger.debug('Message was sent without problems.')
        })
    }

    bestBlock = dbBestBlock
  }
}

export default start
