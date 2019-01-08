// @flow

import cron from 'node-cron'
import { RTMClient } from '@slack/client'
import config from 'config'
import dbApi from './db-api'
import type { DbApi } from 'icarus-backend'; // eslint-disable-line


async function fetchBestBlock(db) {
  return dbApi(db).bestBlock()
}

async function start(db) {
  const { token, channelId } = config.get('slack')
  const rtm = new RTMClient(token)
  rtm.start()

  let bestBlock = await fetchBestBlock(db)

  // running a task every 20 minutes
  const task = cron.schedule('*/20 * * * *', async () => {
    const dbBestBlock = await fetchBestBlock(db)
    if (bestBlock === dbBestBlock) {
      console.log('Database did not update!')

      // RAFA'S MAGICAL COMMANDS TO SWITCH SERVER ENV?

      rtm.sendMessage('Database did not update!', channelId)
        .then(() => {
          console.log('Message was sent without problems.')
        })
        .catch(console.error)

      // one notification in channel is enough :)
      task.stop()
    }
    bestBlock = dbBestBlock
  }, {
    scheduled: false,
  })
  task.start()
}

export default start
