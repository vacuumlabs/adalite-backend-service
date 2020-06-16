// @flow

import { isValidAddress } from 'cardano-crypto.js'
import moment from 'moment'
import Big from 'big.js'
import { zip, nth } from 'lodash'

import type { ServerConfig } from 'icarus-backend'; // eslint-disable-line

const withPrefix = route => `/api${route}`
const invalidAddress = 'Invalid Cardano address!'
const invalidTx = 'Invalid transaction id!'

const arraySum = (numbers) => numbers.reduce((acc, val) => acc.plus(Big(val)), Big(0))

/**
 * Helper function that takes movements for various addresses and a set of addresses we are
 * interested in. The sum of movements for addresses we are interested in is returned.
*/
const txAddressCoins = (addresses, amounts, addressSet) => arraySum(zip(addresses, amounts)
  .filter((pair) => addressSet.has(pair[0]))
  .map((pair) => nth(pair, 1)))

const combinedBalance = (transactions, addresses) => {
  const addressSet = new Set(addresses)
  const totalIn = transactions.reduce((acc, tx) =>
    acc.plus(txAddressCoins(tx.outputs_address, tx.outputs_amount, addressSet)), Big(0))
  const totalOut = transactions.reduce((acc, tx) =>
    acc.plus(txAddressCoins(tx.inputs_address, tx.inputs_amount, addressSet)), Big(0))
  return totalIn.sub(totalOut)
}

const txToAddressInfo = (row) => ({
  ctbId: row.hash,
  ctbTimeIssued: moment(row.time).unix(),
  ctbInputs: row.inputs_address.map(
    (addr, i) => [addr, { getCoin: row.inputs_amount[i] }]),
  ctbOutputs: row.outputs_address.map(
    (addr, i) => [addr, { getCoin: row.outputs_amount[i] }]),
  ctbInputSum: {
    getCoin: `${arraySum(row.inputs_amount)}`,
  },
  ctbOutputSum: {
    getCoin: `${arraySum(row.outputs_amount)}`,
  },
})

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

const initializeTxEntry = (tx) => ({
  ctbId: tx.hash.substr(2), // TODO/hrafn \x format
  ctbTimeIssued: moment(tx.time).unix(), // TODO/hrafn db time of by an hour
  ctbInputs: [],
  ctbOutputs: [],
  ctbInputSum: { getCoin: Big(0) },
  ctbOutputSum: { getCoin: Big(0) },
})


const movementEntry = (tx) => [tx.address, { getCoin: tx.value }]

const buildTxList = (transactions: Array<Object>, movements: Array<Object>) => {
  const txMap = new Map(transactions.map(tx => [tx.id, initializeTxEntry(tx)]))
  movements.txInputs.forEach(txInput => {
    const txEntry = txMap.get(txInput.txid)
    txEntry.ctbInputs.push(movementEntry(txInput))
    txEntry.ctbInputSum.getCoin = txEntry.ctbInputSum.getCoin.plus(txInput.value)
  })

  movements.txOutputs.forEach(txOutput => {
    const txEntry = txMap.get(txOutput.txid)
    txEntry.ctbOutputs.push(movementEntry(txOutput))
    txEntry.ctbOutputSum.getCoin = txEntry.ctbOutputSum.getCoin.plus(txOutput.value)
  })

  return [...txMap.values()].sort((a, b) => b.ctbTimeIssued - a.ctbTimeIssued)
}

const sumTxs = (txs, addressSet) => arraySum(txs
  .filter(tx => addressSet.has(tx.address))
  .map(tx => tx.value))

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
  const inTxsRes = await dbApi.getInwardTransactions(address)
  const outTxsRes = await dbApi.getOutwardTransactions(address)

  const inTxs = inTxsRes.rows
  const outTxs = outTxsRes.rows
  const inTxMovements = await getTxMovements(dbApi, inTxs.map(tx => tx.id))
  const outTxMovements = await getTxMovements(dbApi, outTxs.map(tx => tx.id))

  const txMovements = {
    txInputs: [...inTxMovements.txInputs, ...outTxMovements.txInputs],
    txOutputs: [...inTxMovements.txOutputs, ...outTxMovements.txOutputs],
  }
  const caTxList = buildTxList([...inTxs, ...outTxs], txMovements)
  const addressSet = new Set([address])
  const totalInput = sumTxs(inTxMovements.txOutputs, addressSet)
  const totalOutput = sumTxs(outTxMovements.txInputs, addressSet)
  const right = {
    caAddress: address,
    caType: 'CPubKeyAddress',
    caTxNum: caTxList.length,
    caBalance: {
      getCoin: `${totalInput - totalOutput}`,
    },
    caTxList,
  }
  logger.debug('[addressSummary] result calculated')
  return { Right: right }
}

/**
 * This endpoint returns a transaction summary for a given hash
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const txSummary = (dbApi: any, { logger }: ServerConfig) => async (req: any,
) => {
  const { tx } = req.params
  const getTxResult = await dbApi.getTx(`\\x${tx}`) // TODO/hrafn
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
    ctsId: txRow.hash.toString('hex'),
    ctsTxTimeIssued: blockTime,
    ctsBlockTimeIssued: blockTime,
    ctsBlockHeight: Number(blockRow.block_no),
    ctsBlockEpoch: Math.floor((blockTime - epoch0) / (epochSlots * slotSeconds)),
    ctsBlockSlot: Math.floor((blockTime - epoch0) / slotSeconds) % epochSlots,
    ctsBlockHash: blockRow.hash.toString('hex'),
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
  const txList = await dbApi.bulkAddressSummary(addresses)
  const transactions = txList.rows

  const right = {
    caAddresses: addresses,
    caTxNum: transactions.length,
    caBalance: {
      getCoin: `${combinedBalance(transactions, addresses)}`,
    },
    caTxList: transactions.map(txToAddressInfo),
  }
  logger.debug('[bulkAddressSummary] result calculated')
  return { Right: right }
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
