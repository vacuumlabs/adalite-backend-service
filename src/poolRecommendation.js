import { InternalServerError } from 'restify-errors'
import { getPoolStatsMap, getRecommendedPools } from './poolStats'

const SATURATION_AMOUNT = 62224967000000
const OPTIMAL_AMOUNT = 35000000000000
const MIN_AMOUNT = SATURATION_AMOUNT * 0.15

type ValidPoolHashStakePair = {
  hash: string,
  stake: number,
}

export default (currPoolHash, stake) => {
  const recommendedPools = getRecommendedPools()
  const poolStats = getPoolStatsMap()

  if (!recommendedPools.length) {
    throw new InternalServerError('Recommended pools array empty. Recommendation turned off.')
  }

  const optimalPoolsWithSpace: Array<ValidPoolHashStakePair> = recommendedPools
    .filter(hash => !!poolStats.get(hash) && poolStats.get(hash) + stake < OPTIMAL_AMOUNT)
    .map(hash => (
    // $FlowFixMe poolStats.get(hash) will always hold a value since its filtered beforehand
      { hash, stake: poolStats.get(hash) }
    ))

  const isInRecommendedPoolSet = recommendedPools.includes(currPoolHash)
  if (!optimalPoolsWithSpace.length) {
    return { status: 'NoUnsaturatedPoolAvailable', isInRecommendedPoolSet }
  }

  const emptiestPool = optimalPoolsWithSpace.reduce((acc, pool) => (
    pool.stake < acc.stake ? pool : acc))

  const fullestPool = optimalPoolsWithSpace.reduce((acc, pool) => (
    pool.stake > acc.stake ? pool : acc))

  const currLiveStake = poolStats.get(currPoolHash)
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

  return {
    status,
    recommendedPoolHash: emptiestPool.stake < MIN_AMOUNT ? emptiestPool.hash : fullestPool.hash,
    isInRecommendedPoolSet,
  }
}
