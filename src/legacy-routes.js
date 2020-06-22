// @flow

import { isValidAddress } from 'cardano-crypto.js'
import moment from 'moment'
import Big from 'big.js'

import type {
  ServerConfig,
  Movement,
  MovementEntry,
  TxEntry,
} from 'icarus-backend'; // eslint-disable-line

const withPrefix = route => `/api${route}`
const invalidAddress = 'Invalid Cardano address!'
const invalidTx = 'Invalid transaction id!'

const arraySum = (numbers) => numbers.reduce((acc, val) => acc.plus(Big(val)), Big(0))

/**
 * TODO
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const getTxMovements = async (
  dbApi: any, txIds: Array<string>,
) => {
  const txInputsResult = await dbApi.getDistinctTxInputs(txIds)
  const txOutputsResult = await dbApi.getDistinctTxOutputs(txIds)
  return { txInputs: txInputsResult.rows, txOutputs: txOutputsResult.rows }
}

const initializeTxEntry = (tx) : TxEntry => ({
  ctbId: tx.hash, // TODO/hrafn \x format
  ctbTimeIssued: moment(tx.time).unix(), // TODO/hrafn db time of by an hour
  ctbInputs: [],
  ctbOutputs: [],
  ctbInputSum: { getCoin: Big(0) },
  ctbOutputSum: { getCoin: Big(0) },
})

const initializeMovementEntry = (tx: Movement) : MovementEntry => [
  tx.address, { getCoin: tx.value },
]

const pushMovementToTxMap = (
  txMap: Map<number, TxEntry>, movement: Movement, isInput: boolean,
) : void => {
  const txEntry = txMap.get(movement.txid)
  if (!txEntry) { return }

  if (isInput) {
    txEntry.ctbInputs.push(initializeMovementEntry(movement))
    txEntry.ctbInputSum.getCoin = txEntry.ctbInputSum.getCoin.plus(movement.value)
  } else {
    txEntry.ctbOutputs.push(initializeMovementEntry(movement))
    txEntry.ctbOutputSum.getCoin = txEntry.ctbOutputSum.getCoin.plus(movement.value)
  }
}

const buildTxList = (transactions: Array<Object>, movements) => {
  const txMap = new Map(transactions.map(tx => [tx.id, initializeTxEntry(tx)]))
  movements.txInputs.forEach(txInput => pushMovementToTxMap(txMap, txInput, true))
  movements.txOutputs.forEach(txOutput => pushMovementToTxMap(txMap, txOutput, false))

  const txList: Array<TxEntry> = [...txMap.values()]
    .sort((a, b) => b.ctbTimeIssued - a.ctbTimeIssued)
  return txList
}

const sumTxs = (txs, addressSet) => arraySum(txs
  .filter(tx => addressSet.has(tx.address))
  .map(tx => tx.value))

const getAddressSummaryForAddresses = async (
  dbApi: any, addresses: Array<string>,
) => {
  const inTxsRes = await dbApi.getInwardTransactions(addresses)
  const outTxsRes = await dbApi.getOutwardTransactions(addresses)

  const inTxs = inTxsRes.rows
  const outTxs = outTxsRes.rows
  const inTxMovements = await getTxMovements(dbApi, inTxs.map(tx => tx.id))
  const outTxMovements = await getTxMovements(dbApi, outTxs.map(tx => tx.id))

  const txMovements = {
    txInputs: [...inTxMovements.txInputs, ...outTxMovements.txInputs],
    txOutputs: [...inTxMovements.txOutputs, ...outTxMovements.txOutputs],
  }
  const caTxList = buildTxList([...inTxs, ...outTxs], txMovements)
  const addressSet = new Set(addresses)
  const totalInput = sumTxs(inTxMovements.txOutputs, addressSet)
  const totalOutput = sumTxs(outTxMovements.txInputs, addressSet)

  return {
    caTxNum: caTxList.length,
    caBalance: {
      getCoin: `${totalInput.sub(totalOutput)}`,
    },
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
  const getTxResult = await dbApi.getTx(tx) // TODO/hrafn
  if (getTxResult.rows.length === 0) return { Left: invalidTx }

  const txRow = getTxResult.rows[0]
  const getBlockResult = await dbApi.getBlockById(txRow.block)
  const blockRow = getBlockResult.rows[0]

  const inputsResult = await dbApi.getTxInputs(txRow.id)
  const outputsResult = await dbApi.getTxOutputs(txRow.id)

  const inputs = inputsResult.rows
  const outputs = outputsResult.rows

  const totalInput = arraySum(inputs.map(elem => elem.value))
  const totalOutput = arraySum(outputs.map(elem => elem.value))
  const epoch0 = 1506203091
  const slotSeconds = 20
  const epochSlots = 21600
  const blockTime = moment(blockRow.time).unix()
  const right = {
    ctsId: txRow.hash, // TODO/hrafn \x format,
    ctsTxTimeIssued: blockTime,
    ctsBlockTimeIssued: blockTime,
    ctsBlockHeight: Number(blockRow.block_no),
    ctsBlockEpoch: Math.floor((blockTime - epoch0) / (epochSlots * slotSeconds)),
    ctsBlockSlot: Math.floor((blockTime - epoch0) / slotSeconds) % epochSlots,
    ctsBlockHash: blockRow.hash, // TODO/hrafn \x format,
    ctsRelayedBy: null,
    ctsTotalInput: {
      getCoin: `${totalInput}`,
    },
    ctsTotalOutput: {
      getCoin: `${totalOutput}`,
    },
    ctsFees: {
      getCoin: `${totalInput.sub(totalOutput)}`,
    },
    ctsInputs: inputs.map(
      input => [input.address, { getCoin: input.value }]),
    ctsOutputs: outputs.map(
      output => [output.address, { getCoin: output.value }]),
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
  const result = await dbApi.txSummary(tx)
  if (result.rows.length === 0) {
    return { Left: invalidTx }
  }
  logger.debug('[txRaw] result calculated')
  return { Right: result.rows[0].tx_body }
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
  const mappedRows = result.rows.map((row) => {
    const coins = row.cuCoins
    const newRow = row
    newRow.cuCoins = { getCoin: coins }
    newRow.cuId = row.cuId // TODO/hrafn \x format
    return newRow
  })
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
  const right = await getAddressSummaryForAddresses(dbApi, addresses)
  logger.debug('[bulkAddressSummary] result calculated')
  return { Right: { caAddresses: addresses, ...right } }
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
}
