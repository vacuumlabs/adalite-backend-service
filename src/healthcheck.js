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
  console.log('start') // eslint-disable-line
  const token = process.env.SLACK_TOKEN
  const channelId = process.env.SLACK_CHANNEL
  process.env.BLOCK_RESPONSE = 'true'
  const rtm = new RTMClient(token)
  rtm.start()

  let responding = true
  let bestBlock = await fetchBestBlock(db)

  while (true) { // eslint-disable-line
    await delay(70000) // eslint-disable-line
    const dbBestBlock = await fetchBestBlock(db) // eslint-disable-line
    const changed = !(bestBlock === dbBestBlock)

    if (responding !== changed) {
      /*
        If the block did not change, it is guaranteed that the database does not contain the
        latest data. However, it is possible that the database does not contain the latest data
        even if the block did change, for example in the case when the database is synchronising
        with the blockchain.
      */
      responding = changed
      process.env.BLOCK_RESPONSE = responding.toString()
      const message = changed ? 'Database is updating again.' : 'Database did not update!'
      logger.info(message)
      rtm.sendMessage(message, channelId)
        .then(() => {
          console.log('Message was sent without problems.') // eslint-disable-line
        })
        .catch(console.error) // eslint-disable-line
    }

    bestBlock = dbBestBlock
  }
}

export default start
