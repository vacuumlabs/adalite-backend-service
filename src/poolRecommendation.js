import { InternalServerError } from 'restify-errors'
import { getPoolStatsMap, getRecommendedPools } from './poolStats'

const SATURATION_AMOUNT = 62224967000000
const OPTIMAL_AMOUNT = 35000000000000
const MIN_AMOUNT = SATURATION_AMOUNT * 0.15

type ValidPoolHashStakePair = {
  hash: string,
  stake: number,
}

export default (currPoolHash, accountStake) => {
  const recommendedPools = getRecommendedPools()
  const poolStats = getPoolStatsMap()

  if (!recommendedPools.length) {
    throw new InternalServerError('Recommended pools array empty. Recommendation turned off.')
  }

  const unsaturatedPoolsWithSpace: Array<ValidPoolHashStakePair> = recommendedPools
    .filter(hash =>
      !!poolStats.get(hash) && poolStats.get(hash).liveStake + accountStake < SATURATION_AMOUNT)
    .map(hash => (
    // $FlowFixMe poolStats.get(hash) will always hold a value since its filtered beforehand
      { hash, stake: poolStats.get(hash).liveStake }
    ))
  const optimalPoolsWithSpace = unsaturatedPoolsWithSpace
    .filter(({ stake }) => stake + accountStake < OPTIMAL_AMOUNT)

  const currLiveStake = !!poolStats.get(currPoolHash) && poolStats.get(currPoolHash).liveStake
  let status = null
  if (!currLiveStake) {
    status = 'GivenPoolInvalid'
  } else if (currLiveStake > SATURATION_AMOUNT) {
    status = 'GivenPoolSaturated'
  } else if (currLiveStake > OPTIMAL_AMOUNT) {
    status = 'GivenPoolBeyondOptimum'
  } else if (currLiveStake > MIN_AMOUNT) {
    status = 'GivenPoolOk'
  } else if (currLiveStake > 0) {
    status = 'GivenPoolUnderMinimum'
  }

  let recommendedPoolHash
  if (!unsaturatedPoolsWithSpace.length) {
    recommendedPoolHash = null
  } else {
    const emptiestPool = unsaturatedPoolsWithSpace
      .reduce((acc, pool) => (pool.stake < acc.stake ? pool : acc))
    const fullestOptimalPool = optimalPoolsWithSpace.length
      ? optimalPoolsWithSpace.reduce((acc, pool) => (pool.stake > acc.stake ? pool : acc))
      : null

    recommendedPoolHash = emptiestPool.stake < MIN_AMOUNT || !fullestOptimalPool
      ? emptiestPool.hash
      : fullestOptimalPool.hash
  }

  return {
    status,
    recommendedPoolHash,
    isInRecommendedPoolSet: recommendedPools.includes(currPoolHash),
  }
}
