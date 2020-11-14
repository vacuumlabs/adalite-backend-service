import { getPoolStatsMap } from './poolStats'

type ValidPoolHashStakePair = {
  hash: string,
  stake: number,
}

export default (currPoolHash, stake) => {
  const ADLTPoolsSet = new Set([
    'ce19882fd62e79faa113fcaef93950a4f0a5913b20a0689911b6f62d',
    '04c60c78417132a195cbb74975346462410f72612952a7c4ade7e438',
    '92229dcf782ce8a82050fdeecb9334cc4d906c6eb66cdbdcea86fb5f',
    'd785ff6a030ae9d521770c00f264a2aa423e928c85fc620b13d46eda',
    '936f24e391afc0738c816ae1f1388957b977de3d0e065dc9ba38af8d',
  ])

  const saturationAmount = 62000000000000
  const optimalAmount = 58000000000000
  const minAmount = 9500000000000

  const poolStats = getPoolStatsMap()
  const nonSaturatedPoolsWithSpace: Array<ValidPoolHashStakePair> = [...ADLTPoolsSet]
    .filter(hash => !!poolStats.get(hash) && poolStats.get(hash) + stake < optimalAmount)
    .map(hash => (
    // $FlowFixMe poolStats.get(hash) will always hold a value since its filtered beforehand
      { hash, stake: poolStats.get(hash) }
    ))

  const isInOurPool = ADLTPoolsSet.has(currPoolHash)
  if (!nonSaturatedPoolsWithSpace.length) {
    return { status: 'ADLTPoolsSaturated', isInOurPool }
  }

  const emptiestPool = nonSaturatedPoolsWithSpace.reduce((acc, pool) => (
    pool.stake < acc.stake ? pool : acc))

  const fullestPool = nonSaturatedPoolsWithSpace.reduce((acc, pool) => (
    pool.stake > acc.stake ? pool : acc))

  const currLiveStake = poolStats.get(currPoolHash)
  let status = null
  if (!currLiveStake) status = 'GivenPoolMissingFromStats'
  if (!!currLiveStake && currLiveStake > saturationAmount) status = 'GivenPoolSaturated'
  if (!!currLiveStake && currLiveStake < optimalAmount && currLiveStake > minAmount) status = 'GivenPoolOk'

  console.log('fullest', fullestPool)
  console.log('emptiest', emptiestPool)

  return {
    status,
    recommendedPoolHash: emptiestPool.stake < minAmount ? emptiestPool.hash : fullestPool.hash,
    isInOurPool,
  }
}
