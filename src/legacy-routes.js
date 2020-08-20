// @flow

// import { isValidAddress } from 'cardano-crypto.js'
import moment from 'moment'
import Big from 'big.js'

import type {
  ServerConfig,
  TxInput,
  TxOutput,
  TxInputOutputEntry,
  TxEntry,
  Tx,
  CoinObject,
  DbApi,
} from 'icarus-backend'; // eslint-disable-line
import { _ } from 'lodash'
import { wrapHashPrefix, unwrapHashPrefix, groupInputsOutputs, assignKeyEntryToObj } from './helpers'

const isValidAddress = (address) => true // eslint-disable-line no-unused-vars
const withPrefix = route => `/api${route}`
const invalidAddress = 'Invalid Cardano address!'
const invalidTx = 'Invalid transaction id!'

const arraySum = (
  numbers: Array<Big | number>,
): Big => numbers.reduce((acc: Big, val) => acc.plus(Big(val)), Big(0))
const getCoinObject = (value: Big | number): CoinObject => ({ getCoin: `${Big(value)}` })

/**
 * Initializes tx input/output entry
 * @param {TxInput | TxOutput} txInputOutput Tx input or output
 */
const initializeTxInputOutputEntry = (txInputOutput: TxInput | TxOutput)
: TxInputOutputEntry => [txInputOutput.address, getCoinObject(txInputOutput.value)]

/**
 * Builds tx entry in the caTxList format
 * @param {Tx} tx Transaction from database
 * @param {Array<TxInput>} txInputs Transaction inputs of the tx from database
 * @param {Array<TxOutput>} txOutputs Transaction outputs of the tx from database
 */
const initializeTxEntry = (
  tx: Tx, txInputs: Array<TxInput>, txOutputs: Array<TxOutput>,
) : TxEntry => ({
  ctbId: unwrapHashPrefix(tx.hash),
  ctbTimeIssued: moment(tx.time).unix(),
  ctbInputs: txInputs.map(initializeTxInputOutputEntry),
  ctbOutputs: txOutputs.map(initializeTxInputOutputEntry),
  ctbInputSum: getCoinObject(arraySum(txInputs.map(txInput => txInput.value))),
  ctbOutputSum: getCoinObject(arraySum(txOutputs.map(txOutput => txOutput.value))),
  fee: tx.fee,
})

/**
 * Assigns tx inputs and outputs to corresponding transactions to build caTxList
 * @param {Array<Tx>} transactions Array of transactions fetched from database
 * @param {Array<TxInput>} txInputs Array of tx inputs
 * @param {Array<TxOutput>} txOutputs Array of tx outputs
 */
const buildTxList = (
  transactions: Array<Tx>,
  txInputs: Array<TxInput>,
  txOutputs: Array<TxOutput>,
) => {
  const txInputMap = groupInputsOutputs(txInputs)
  const txOutputMap = groupInputsOutputs(txOutputs)
  const txList: Array<TxEntry> = transactions
    .map(tx => initializeTxEntry(tx, txInputMap[tx.dbId], txOutputMap[tx.dbId] || []))
    .sort((a, b) => b.ctbTimeIssued - a.ctbTimeIssued)
  return txList
}

const sumTxs = (txs, addressSet) => arraySum(txs
  .filter(tx => addressSet.has(tx.address))
  .map(tx => tx.value))

/**
 * An abstraction of building a result for address summary
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const getAddressSummaryForAddresses = async (
  dbApi: any, addresses: Array<string>,
) => {
  const txs = await dbApi.getTransactions(addresses)
  const uniqueTxIds = [...new Set(txs.map(tx => tx.dbId))]

  const txInputs = await dbApi.getTxsInputs(uniqueTxIds)
  const txOutputs = await dbApi.getTxsOutputs(uniqueTxIds)
  const caTxList = buildTxList(txs, txInputs, txOutputs)

  const addressSet = new Set(addresses)
  const totalInput = sumTxs(txOutputs, addressSet)
  const totalOutput = sumTxs(txInputs, addressSet)

  return {
    caTxNum: caTxList.length,
    caBalance: getCoinObject(totalInput.sub(totalOutput)),
    caTxList,
  }
}

/**
 * This endpoint returns a summary for a given address
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const addressSummary = (dbApi: any, { logger }: ServerConfig) => async (req: any,
) => {
  const { address } = req.params
  if (!isValidAddress(address)) {
    return { Left: invalidAddress }
  }
  const right = await getAddressSummaryForAddresses(dbApi, [address])
  logger.debug('[addressSummary] result calculated')
  return {
    Right: {
      caAddress: address,
      caType: 'CPubKeyAddress',
      ...right,
    },
  }
}

/**
 * This endpoint returns a transaction summary for a given hash
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const txSummary = (dbApi: any, { logger }: ServerConfig) => async (req: any,
) => {
  const { tx } = req.params
  const txResult = await dbApi.getTx(wrapHashPrefix(tx))
  if (txResult.length === 0) return { Left: invalidTx }

  const txRow = txResult[0]
  const blockResult = await dbApi.getBlockById(txRow.blockId)
  const blockRow = blockResult[0]

  const inputs = await dbApi.getSingleTxInputs(txRow.dbId)
  const outputs = await dbApi.getTxsOutputs([txRow.dbId])

  const totalInput = arraySum(inputs.map(elem => elem.value))
  const totalOutput = arraySum(outputs.map(elem => elem.value))
  const epoch0 = 1506203091
  const slotSeconds = 20
  const epochSlots = 21600
  const blockTime = moment(blockRow.time).unix()
  const right = {
    ctsId: unwrapHashPrefix(txRow.hash),
    ctsTxTimeIssued: blockTime,
    ctsBlockTimeIssued: blockTime,
    ctsBlockHeight: Number(blockRow.block_no),
    ctsBlockEpoch: Math.floor((blockTime - epoch0) / (epochSlots * slotSeconds)),
    ctsBlockSlot: Math.floor((blockTime - epoch0) / slotSeconds) % epochSlots,
    ctsBlockHash: unwrapHashPrefix(blockRow.hash),
    ctsRelayedBy: null,
    ctsTotalInput: getCoinObject(totalInput),
    ctsTotalOutput: getCoinObject(totalOutput),
    ctsFees: getCoinObject(totalInput.sub(totalOutput)),
    ctsInputs: inputs.map(initializeTxInputOutputEntry),
    ctsOutputs: outputs.map(initializeTxInputOutputEntry),
  }
  logger.debug('[txSummary] result calculated')
  return { Right: right }
}

/**
 * This endpoint returns a raw transaction body for a given hash
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const txRaw = (dbApi: any, { logger }: ServerConfig) => async (req: any,
) => {
  const { tx } = req.params
  const txs = await dbApi.getRawTx(wrapHashPrefix(tx))
  if (txs.length === 0) {
    return { Left: invalidTx }
  }
  logger.debug('[txRaw] result calculated')
  return { Right: unwrapHashPrefix(txs[0].tx_body) }
}

/**
 * This endpoint returns unspent transaction outputs for a given array of addresses
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const unspentTxOutputs = (dbApi: any, { logger, apiConfig }: ServerConfig) => async (req: any,
) => {
  const addresses = req.body
  const limit = apiConfig.addressesRequestLimit
  if (!addresses || addresses.length === 0 || addresses.length > limit) {
    return { Left: `Addresses request length should be (0, ${limit}]` }
  }
  if (addresses.some((addr) => !isValidAddress(addr))) {
    return { Left: invalidAddress }
  }
  const result = await dbApi.utxoLegacy(addresses)
  const mappedRows = result.map((row) => (
    {
      ...row,
      cuId: unwrapHashPrefix(row.cuId),
      cuCoins: getCoinObject(row.cuCoins),
    }
  ))
  logger.debug('[unspentTxOutputs] result calculated')
  return { Right: mappedRows }
}

/**
 * This endpoint returns the list of addresses, the number of their transactions and the list of
 * transactions.
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const bulkAddressSummary = (dbApi: any, { logger, apiConfig }: ServerConfig) => async (req: any,
) => {
  const addresses = req.body
  const limit = apiConfig.addressesRequestLimit
  if (!addresses || addresses.length === 0 || addresses.length > limit) {
    return { Left: `Addresses request length should be (0, ${limit}]` }
  }
  if (addresses.some((addr) => !isValidAddress(addr))) {
    return { Left: invalidAddress }
  }
  const addressSummaryResult = await getAddressSummaryForAddresses(dbApi, addresses)
  logger.debug('[bulkAddressSummary] result calculated')
  return { Right: { caAddresses: addresses, ...addressSummaryResult } }
}

/**
 * Gets all valid stake pools and their information as map
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const stakePools = (dbApi: DbApi, { logger }: ServerConfig) => async () => {
  logger.debug('[stakePools] query started')
  const result = await dbApi.stakePoolsInfo()
  const poolsMappedByHash = _.chain(result)
    .keyBy('poolHash')
    .mapValues(pool => _.omit(pool, 'poolHash'))
    .value()
  logger.debug('[stakePools] query finished')
  return poolsMappedByHash
}

/**
 * Gets all valid stake pools and their information as array
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const stakePoolsLegacy = (dbApi: DbApi, { logger }: ServerConfig) => async () => {
  logger.debug('[stakePools] query started')
  const result = await dbApi.stakePoolsInfo()
  logger.debug('[stakePools] query finished')
  return result
}

/**
 * Helper for getting information for a single pool specified by pool id
 * @param {*} db Database
 * @param {number} accountDbId Server Config Object
 */
const poolInfoForAccountId = async (dbApi: DbApi, accountDbId: number) => {
  const [delegatedPool] = await dbApi.poolDelegatedTo(accountDbId)
  if (!delegatedPool || !delegatedPool.poolHashDbId) { return {} }
  const poolInfo = await dbApi.singleStakePoolInfo(delegatedPool.poolHashDbId)
  return poolInfo.length
    ? {
      ...poolInfo[0],
      retiringEpoch: delegatedPool.retiringEpoch,
    }
    : {}
}

const nextRewardInfo = async (dbApi: DbApi, accountDbId: number, currentEpoch: number) => {
  const epochDelegations = await dbApi.epochDelegations(accountDbId)
  if (epochDelegations.length === 0) { return {} }

  let i = epochDelegations.length - 1
  const currentlyRewardedEpoch = currentEpoch - 3 // rewards are distributed with a lag of 3 epochs
  // find active delegation for nextRewardedEpoch, if not present, take next first epoch
  while (i > 0 && epochDelegations[i - 1].epochNo <= currentlyRewardedEpoch) { i -= 1 }
  const nextReward = epochDelegations[i]
  nextReward.epochNo = Math.max(currentlyRewardedEpoch, nextReward.epochNo)

  const poolInfo = await dbApi.singleStakePoolInfo(nextReward.poolHashDbId)
  const firstDelegationEpochWithRewards = 209
  const diff = nextReward.epochNo - firstDelegationEpochWithRewards
  const rewardDate = moment.utc('2020-08-23 21:44:00').add(diff * 5, 'days').format('DD.MM.YYYY HH:mm')

  return {
    forEpoch: nextReward.epochNo,
    rewardDate: `${rewardDate} UTC`,
    metadataUrl: poolInfo.length ? poolInfo[0].url : '',
  }
}

/**
 * Helper for getting account database id for a staking address
 * @param {*} db Database
 * @param {string} stakeAddress Server Config Object
 */
const getStakeAddrDbId = async (dbApi: DbApi, stakeAddress: string) => {
  const stakeAddrDbIdResult = await dbApi.stakeAddressId(wrapHashPrefix(stakeAddress))
  return stakeAddrDbIdResult.length > 0
    ? stakeAddrDbIdResult[0].accountDbId : undefined
}

/**
 * Returns delegation, rewards and stake key registration for a given account
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const accountInfo = (dbApi: DbApi, { logger }: ServerConfig) => async (req: any) => {
  logger.debug('[accountInfo] query started')
  const { stakeAddress } = req.params
  const accountDbId = await getStakeAddrDbId(dbApi, stakeAddress)
  const delegation = accountDbId ? await poolInfoForAccountId(dbApi, accountDbId) : {}
  const hasStakingKey = accountDbId ? await dbApi.hasActiveStakingKey(accountDbId) : false
  const rewards = accountDbId ? await dbApi.rewardsForAccountDbId(accountDbId) : 0
  const currentEpoch = await dbApi.currentEpoch()
  const nextRewardDetails = accountDbId
    ? await nextRewardInfo(dbApi, accountDbId, currentEpoch)
    : {}
  logger.debug('[accountInfo] query finished')
  return {
    currentEpoch,
    delegation,
    hasStakingKey,
    rewards,
    nextRewardDetails,
  }
}

/**
 * Returns delegation, rewards and stake key registration for a given account
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const stakingHistory = (dbApi: DbApi, { logger }: ServerConfig) => async (req: any) => {
  logger.debug('[stakingHistory] query started')
  const { stakeAddress } = req.params
  const accountDbId = await getStakeAddrDbId(dbApi, stakeAddress)
  const delegations = accountDbId ? await dbApi.delegationHistory(accountDbId) : []
  const typedDelegations = delegations.map(d => assignKeyEntryToObj(d, 'type', 'Stake delegation'))
  return typedDelegations


  // const delegation = accountDbId ? await poolInfoForAccountId(dbApi, accountDbId) : {}
  // const hasStakingKey = accountDbId ? await dbApi.hasActiveStakingKey(accountDbId) : false
  // const rewards = accountDbId ? await dbApi.rewardsForAccountDbId(accountDbId) : 0
  // const currentEpoch = await dbApi.currentEpoch()
  // const nextRewardDetails = accountDbId
  //   ? await nextRewardInfo(dbApi, accountDbId, currentEpoch)
  //   : {}
  // logger.debug('[accountInfo] query finished')
  // return {
  //   currentEpoch,
  //   delegation,
  //   hasStakingKey,
  //   rewards,
  //   nextRewardDetails,
  // }
}

export default {
  addressSummary: {
    method: 'get',
    path: withPrefix('/addresses/summary/:address'),
    handler: addressSummary,
  },
  txSummary: {
    method: 'get',
    path: withPrefix('/txs/summary/:tx'),
    handler: txSummary,
  },
  txRaw: {
    method: 'get',
    path: withPrefix('/txs/raw/:tx'),
    handler: txRaw,
  },
  unspentTxOutputs: {
    method: 'post',
    path: withPrefix('/bulk/addresses/utxo'),
    handler: unspentTxOutputs,
  },
  bulkAddressSummary: {
    method: 'post',
    path: withPrefix('/bulk/addresses/summary'),
    handler: bulkAddressSummary,
  },
  stakePools: {
    method: 'get',
    path: withPrefix('/v2/stakePools'),
    handler: stakePools,
  },
  stakePoolsLegacy: {
    method: 'get',
    path: withPrefix('/stakePools'),
    handler: stakePoolsLegacy,
  },
  accountInfo: {
    method: 'get',
    path: withPrefix('/account/info/:stakeAddress'),
    handler: accountInfo,
  },
  stakingHistory: {
    method: 'get',
    path: withPrefix('/account/stakingHistory/:stakeAddress'),
    handler: stakingHistory,
  }
}
