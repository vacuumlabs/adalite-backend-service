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
    const txBody = '83a40081825820dde38f7401d3d85371d9efa944b78cee79e44635f9b2c108b512320d75fae40a00018182583901f3db2225703e4cfbe2227772bdf057f9829449f18ac81e250ceb01ca0a84430507e150f0a06109dc3a7b1956b7a0586ae9078a55ef0e0b031a000fc50c021a0002ac09031a00989680a100818258209c253c89bbe32d0b11c2abfa464e75627af25beb90c15adbd9f6b62160dfa838584002bfd17db30a1cdfac05c16b56d03f3594628dfc9e614debbfa50435d4af6af1717bc3f90b8b305e3ca23dcbf333d2863277f9196bd1536b7d1b74509c057702f6'
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
    const canSubmitTx = await txTest()

    const isHealthy = isDbSynced && canSubmitTx
    const { healthy: wasHealthy } = instanceHealthStatus
    let { unhealthyFrom } = instanceHealthStatus

    if (isHealthy !== wasHealthy) {
      unhealthyFrom = isHealthy ? null : currentTime

      const message = isHealthy ? 'Database is updating again.' : 'Database did not update!'
      const explorerMessage = expectedBestBlock === 0 ? ' Cardano explorer down!' : ''
      logger.info(message)
      rtm.sendMessage(`${process.env.name || 'backend-service'}: ${message}${explorerMessage}`, channelId)
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
