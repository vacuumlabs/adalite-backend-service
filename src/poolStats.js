// @flow
import axios from 'axios'
import delay from 'delay'
import { RTMClient } from '@slack/client'
import config from './config'
import type { DbApi } from 'icarus-backend' // eslint-disable-line

const { logger } = config.get('server')
const POOL_STATS_URL = 'https://js.adapools.org/pools.json'
let poolStatsMap: Map<string, number> = new Map()
let recommendedPools: Array<string> = []
type statsEntry = {
  db_ticker: string,
  db_name: string,
  db_url: string,
  tax_ratio: string,
  tax_fix: string,
  roa: string,
  blocks_epoch: string,
  blocks_lifetime: string,
  pledge: string,
  saturated: number,
}

async function getNewStats(): Promise<Map<string, Object> | null> {
  try {
    const { data: poolStats } = await axios.get(POOL_STATS_URL)
    const HashStakePairs = Object.entries(poolStats).map(
      // $FlowFixMe total_stake will be present in the result, if not, we set it as null
      ([hash, entry]: [string, statsEntry]) => [hash, entry.total_stake ?
        {
          liveStake: parseInt(entry.total_stake, 10),
          ticker: entry.db_ticker,
          name: entry.db_name,
          homepage: entry.db_url,
          margin: parseFloat(entry.tax_ratio),
          fixedCost: entry.tax_fix,
          roa: entry.roa,
          epochBlocks: entry.blocks_epoch,
          lifeTimeBlocks: entry.blocks_lifetime,
          pledge: entry.pledge,
          saturatedPercentage: entry.saturated,
        }
        : null,
      ],
    )
    return new Map(HashStakePairs)
  } catch (error) {
    logger.error(error)
    return null
  }
}

export async function poolStatsLoop(recommendedPoolsArr: Array<string>) {
  recommendedPools = recommendedPoolsArr
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
    }

    const recommendedPoolsNotInStats = newStats ?
      recommendedPools.filter(hash => !newStats.has(hash))
      : []

    if (!newStats || recommendedPoolsNotInStats.length) {
      const errorMessage = !newStats
        ? `Failed to fetch from ${POOL_STATS_URL}`
        : `Recommended pool(s) '${recommendedPoolsNotInStats.toString()}' not present in stats`
      logger.error(errorMessage)

      rtm.sendMessage(`${process.env.name || 'backend-service'}: ${errorMessage}`, channelId)
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

export function getRecommendedPools() {
  return recommendedPools
}
