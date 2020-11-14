// @flow
import axios from 'axios'
import delay from 'delay'
import { RTMClient } from '@slack/client'
import config from './config'
import type { DbApi } from 'icarus-backend' // eslint-disable-line

const { logger } = config.get('server')
const POOL_STATS_URL = 'https://js.adapools.org/pools.json'
let poolStatsMap: Map<string, number> = new Map()

async function getNewStats(): Promise<Map<string, number> | null> {
  try {
    const { data: poolStats } = await axios.get(POOL_STATS_URL)
    const HashStakePairs = Object.entries(poolStats).map(
      // $FlowFixMe total_stake will be present in the result, if not, we set it as null
      ([hash, entry]) => [hash, entry.total_stake ? parseInt(entry.total_stake, 10) : null],
    )
    return new Map(HashStakePairs)
  } catch (error) {
    logger.error(error)
    return null
  }
}

export async function poolStatsLoop() {
  const token = process.env.SLACK_TOKEN
  const channelId = process.env.SLACK_CHANNEL
  const rtm = new RTMClient(token)
  if (token) {
    rtm.start()
  }

  /* eslint-disable no-await-in-loop */
  while (true) { // eslint-disable-line
    const newStats = await getNewStats()
    if (newStats) {
      poolStatsMap = newStats
    } else {
      rtm.sendMessage(`${process.env.name || 'backend-service'}: Failed to fetch pool stats from ${POOL_STATS_URL}`, channelId)
        .then(() => {
          logger.debug('Message was sent without problems.')
        })
        .catch((e) => {
          logger.error(`Error sending slack message: ${e}`)
        })
    }

    await delay(60000)
  }
}

export function getPoolStatsMap() {
  return poolStatsMap
}
