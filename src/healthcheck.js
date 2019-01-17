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
  console.log('start') // eslint-disable-line
  const token = process.env.SLACK_TOKEN
  const channelId = process.env.SLACK_CHANNEL
  process.env.BLOCK_RESPONSE = 'true'
  let responding = true
  const rtm = new RTMClient(token)
  rtm.start()

  let bestBlock = await fetchBestBlock(db)

  const slackMessage = {
    true: 'Database is updating again.',
    false: 'Database did not update!',
  }

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
      logger.info(slackMessage[changed])
      rtm.sendMessage(slackMessage[changed], channelId)
        .then(() => {
          console.log('Message was sent without problems.') // eslint-disable-line
        })
        .catch(console.error) // eslint-disable-line
    }

    bestBlock = dbBestBlock
  }
}

export default start
