// @flow
import config from 'config'
import type { DbApi } from 'icarus-backend'; // eslint-disable-line

const cron = require('node-cron')
const { RTMClient } = require('@slack/client')

async function fetchBestBlock(dbApi: DbApi) {
  return dbApi.bestBlock()
}

async function start() {
  const { token, channelId } = config.get('slack')
  const rtm = new RTMClient(token)
  rtm.start()

  let bestBlock = fetchBestBlock()

  // running a task every 20 minutes
  cron.schedule('20 * * * *', () => {
    const dbBestBlock = fetchBestBlock()
    if (bestBlock === dbBestBlock) {
      console.log('Database did not update!')

      // MAGICAL RAFA'S COMMANDS TO SWITCH SERVER ENV?

      rtm.sendMessage('Database did not update!', channelId)
        .then(() => {
          console.log('Message sent without problems')
        })
        .catch(console.error)
    }
    bestBlock = dbBestBlock
  })
}

export default start
