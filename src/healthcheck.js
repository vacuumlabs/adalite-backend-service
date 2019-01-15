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

async function start(db) {
  const { token, channelId } = config.get('slack')
  const rtm = new RTMClient(token)
  rtm.start()

  let bestBlock = await fetchBestBlock(db)

  while (true) {
    await delay(30000) // eslint-disable-line
    const dbBestBlock = await fetchBestBlock(db) // eslint-disable-line
    if (bestBlock === dbBestBlock) {
      logger.info('Database did not update!')

      rtm.sendMessage('Database did not update!', channelId)
        .then(() => {
          console.log('Message was sent without problems.')
        })
        .catch(console.error)

      // one notification in channel is enough :)
      break
    }
    bestBlock = dbBestBlock
  }
}

export default start
