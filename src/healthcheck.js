// @flow

import axios from 'axios'
import delay from 'delay'
import { RTMClient } from '@slack/client'
import config from './config'
import dbApi from './db-api'
import importerApi from './importer-api'
import type { DbApi } from 'icarus-backend' // eslint-disable-line

const { logger, importerSendTxEndpoint, healthcheckUrl } = config.get('server')
const importer = importerApi(importerSendTxEndpoint)

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
  return axios.get(healthcheckUrl) // eslint-disable-line
    .then(response => {
      const pooltoolHeight = response.data.pooltool_height || 0
      const explorerHeight = response.data.explorer_height || 0
      return Math.max(pooltoolHeight, explorerHeight)
    })
    .catch(error => {
      logger.debug(error)
      return 0
    })
}

async function txTest(): Promise<boolean> {
  let response
  try {
    // eslint-disable-next-line max-len
    const txBody = '00e000020102020000000001290dd9c3ee86405db0e85f64d31f5bdaf30035edbea7a7c58f2d4de8401fa928b4c2e783b70ec9396affe92eedf69ddb196c1528565ed912ff82a32b1ba88fb79e795aa500000000000f424084530b2ed5daf52e5b0d92caab230749a0d57488c6d8607336788a016c014f700f86cab5f073c35bbeb3e83be9264ccaaf358342937196debf5c72a032516827c60000000001122a7901f33ce1ad5342473a5faa3a550d3bfe71521a1786def2e306c83604fa5be077166470aecc99c6a91fd10704e7329c12d0a95ad2f580825fdff4aa4b82ac9f9d04'
    const signedBody = {
      signedTx: Buffer.from(txBody, 'hex').toString('base64'),
    }
    response = await importer.sendTx(signedBody)
    if (response.status === 200 && response.data === '@Ok') {
      return true
    }
  } catch (err) {
    if (err.response && err.response.status === 400) {
      return true
    }
    logger.error(`[healthcheck] Unexpected tx submission response: ${err}`)
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

    const isDbSynced = expectedBestBlock - dbBestBlock <= 10

    // eslint-disable-next-line no-await-in-loop
    const canSubmitTx = await txTest()

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
