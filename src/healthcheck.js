// @flow

import axios from 'axios'
import delay from 'delay'
import { RTMClient } from '@slack/client'
import config from './config'
import dbApi from './db-api'

const { logger } = config.get('server')
const cardanoHttpBridgeUrl = config.get('cardanoHttpBridgeUrl')

// TODO refactor to state machine, add tests

let instanceHealthStatus = {
  healthy: false,
  unhealthyFrom: 0,
  dbBestBlock: null,
  expectedBestBlock: null,
  canSubmitTx: false,
}

async function fetchDbBestBlock(db): Promise<number> {
  return dbApi(db).bestBlock()
}

async function fetchExpectedBestBlock(): Promise<number> {
  try {
    const {
      data: {
        data: {
          cardano: {
            blockHeight,
          },
        },
      },
    } = (await axios.post(
      'https://explorer.cardano-mainnet.iohk.io/graphql',
      {
        query: 'query cardanoDynamic {\n  cardano {\n    blockHeight\n    currentEpoch {\n      blocks(limit: 1, order_by: {number: desc_nulls_last}) {\n        slotWithinEpoch\n      }\n      lastBlockTime\n      number\n    }\n  }\n}\n',
        variables: {},
      },
    ))

    return blockHeight || 0
  } catch (error) {
    logger.error(error)
  }

  return 0
}

async function checkCardanoHttpBridge(): Promise<boolean> {
  let response = null
  try {
    response = await axios.get(`${cardanoHttpBridgeUrl}/mainnet/status`, {
      timeout: 10000,
    })
    // until we get a response from cardano-http-bridge
    // and until it communicates with remote nodes it's not ready
    return response && response.data && response.data.remote !== null
  } catch (error) {
    logger.error(error)
  }

  return false
}

export async function healthcheckLoop(db: any) {
  logger.debug('start')

  const token = process.env.SLACK_TOKEN
  const channelId = process.env.SLACK_CHANNEL
  const rtm = new RTMClient(token)
  if (token) {
    rtm.start()
  }

  while (true) { // eslint-disable-line
    const dbBestBlock = await fetchDbBestBlock(db) // eslint-disable-line
    const expectedBestBlock = await fetchExpectedBestBlock() // eslint-disable-line
    const currentTime = Math.floor((new Date().getTime()) / 1000)

    const isDbSynced = (expectedBestBlock - dbBestBlock <= 5)

    // eslint-disable-next-line no-await-in-loop
    const isCardanoHttpBridgeOk = await checkCardanoHttpBridge()

    const isHealthy = isDbSynced && isCardanoHttpBridgeOk
    const { healthy: wasHealthy } = instanceHealthStatus
    let { unhealthyFrom } = instanceHealthStatus

    if (isHealthy !== wasHealthy) {
      unhealthyFrom = isHealthy ? null : currentTime

      const message = isHealthy ? 'Database is updating again.' : 'Database did not update!'
      logger.info(message)
      rtm.sendMessage(`${process.env.name || 'backend-service'}: ${message}`, channelId)
        .then(() => {
          logger.debug('Message was sent without problems.')
        })
        .catch((e) => {
          logger.error(`Error sending slack message: ${e}`)
        })
    }

    instanceHealthStatus = {
      healthy: isHealthy,
      unhealthyFrom,
      dbBestBlock,
      expectedBestBlock,
      isCardanoHttpBridgeOk,
    }

    await delay(70000) // eslint-disable-line
  }
}

export function getInstanceHealthStatus() {
  return instanceHealthStatus
}
