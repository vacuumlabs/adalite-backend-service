// @flow

import axios from 'axios'
import delay from 'delay'
import { RTMClient } from '@slack/client'
import config from './config'
import dbApi from './db-api'
import importerApi from './tx-submit-api'
import type { DbApi } from 'icarus-backend' // eslint-disable-line

const { logger, txSubmitApiUrl } = config.get('server')
const importer = importerApi(txSubmitApiUrl)

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
            tip: {
              number: blockHeight,
            },
          },
        },
      },
    } = (await axios.post(
      'https://explorer.cardano-mainnet.iohk.io/graphql',
      {
        query: 'query cardanoDynamic {\n  cardano {\n    tip {\n      number\n      slotInEpoch\n      forgedAt\n      protocolVersion\n    }\n    currentEpoch {\n      number\n    }\n  }\n}\n',
        variables: {},
      },
    ))

    return blockHeight || 0
  } catch (error) {
    logger.error(error)
  }

  return 0
}

async function txTest(): Promise<boolean> {
  let response
  try {
    // eslint-disable-next-line max-len
    const txBody = '82839f8200d818582482582034b30ffcc37cb23320d01286e444711ceabc74e96c9fe2387f5c3f313942b32900ff9f8282d818584283581c8c0acb0542d176ddbb02678462081194e40204fb622960d188388b64a101581e581c6aedca971f6e65187d53b8315b90dfdb80ac4d6bc72c6bf0b5bad01e001a3c747b481a0007a1208282d818584283581ceb2e580be8db93a736bdd8e9fe0d5f6e8ca50f456bf11834749f98a4a101581e581c6aedca971f6e65187d53bc318a1979025a753c53a2d781e915cc5858001aaf177b461a000503daffa0818200d81858858258409b39227a5c47d594e14b39304af5100a7de7f348d0548b7dc9df49615b9a2de50e6ed2a5ebe9b917cea198cb4c2db24d3829ab4cd7b0345df8aa420d5d7acc6f584004d4d7db6eb5b0f352d3f5ad036ce73968155a539f7f60f85a1d9b264d1cc2bc9e7eef7262fa45b579dd1f30b8d7faff9e362a77a4f51c66074b75e47e15bf06'
    response = await importer.sendTx(Buffer.from(txBody, 'hex'))
  } catch (err) {
    if (err.response && err.response.status === 400) {
      return true
    }
    logger.error(`[healthcheck] Unexpected tx submission error: ${err.message}`)
    return false
  }

  logger.error(`[healthcheck] Unexpected tx submission response: ${response}`)
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

    // difference is not abs() to preserve truthy value if explorer is down
    const isDbSynced = (expectedBestBlock - dbBestBlock <= 5)

    // eslint-disable-next-line no-await-in-loop
    const canSubmitTx = true // TODO: revert

    const isHealthy = isDbSynced && canSubmitTx
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
      canSubmitTx,
    }

    await delay(70000) // eslint-disable-line
  }
}

export function getInstanceHealthStatus() {
  return instanceHealthStatus
}
