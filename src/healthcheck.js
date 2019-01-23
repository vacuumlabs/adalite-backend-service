// @flow

import delay from 'delay'
import { RTMClient } from '@slack/client'
import config from 'config'
import axios from 'axios'
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

  let healthy = true
  let bestBlock = await fetchBestBlock(db)

  while (true) { // eslint-disable-line
    await delay(70000) // eslint-disable-line
    const dbBestBlock = await fetchBestBlock(db) // eslint-disable-line
    let behind = false
    axios.get('https://cardanoexplorer.com/api/blocks/pages')
      .then(response => {
        const pages = response.data.Right[0]
        const items = response.data.Right[1].length
        const explorerBlock = ((pages - 1) * 10) + items
        behind = (explorerBlock - dbBestBlock > 3)
      })
      .catch(error => {
        logger.debug(error)
      })
    const upToDate = !(bestBlock === dbBestBlock) && !behind

    if (healthy !== upToDate) {
      process.env.DATABASE_UNHEALTHY = healthy.toString()
      healthy = upToDate
      const message = upToDate ? 'Database is updating again.' : 'Database did not update!'
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
