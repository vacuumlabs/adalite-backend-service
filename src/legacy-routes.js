// @flow

import { isValidAddress } from 'cardano-crypto.js'
import moment from 'moment'
import Big from 'big.js'

import type {
  ServerConfig,
  TxInput,
  TxOutput,
  TxInputOutputEntry,
  TxEntry,
  Tx,
} from 'icarus-backend'; // eslint-disable-line

const withPrefix = route => `/api${route}`
const invalidAddress = 'Invalid Cardano address!'
const invalidTx = 'Invalid transaction id!'

const arraySum = (numbers) => numbers.reduce((acc, val) => acc.plus(Big(val)), Big(0))

/**
 * Database stores all hashes with prefix of '\x'. To hide inner database structure and
 * deal with just the results in common format, these functions wrap and unwrap the hashes.
*/
const wrapHashPrefix = (hash: string): string => `\\x${hash}`
const unwrapHashPrefix = (hash: string): string => hash.substr(2)

/**
 * Initializes tx entry in the caTxList format into which inputs can be added and summed.
 * @param {Tx} tx Transaction from database
 */
const initializeTxEntry = (tx: Tx) : TxEntry => ({
  ctbId: unwrapHashPrefix(tx.hash),
  ctbTimeIssued: moment(tx.time).unix(),
  ctbInputs: [],
  ctbOutputs: [],
  ctbInputSum: { getCoin: Big(0) },
  ctbOutputSum: { getCoin: Big(0) },
})

/**
 * Initializes tx input/output entry
 * @param {TxInput | TxOutput} txInputOutput Tx input or output
 */
const initializeTxInputOutputEntry = (txInputOutput: TxInput | TxOutput)
: TxInputOutputEntry => [txInputOutput.address, { getCoin: txInputOutput.value }]

/**
 * Pushes tx input/output to corresponding tx entry and sums its value
 * according to whether it's tx input or output
 * @param {Map<number, TxEntry>} txMap Map which holds txEntries at id keys used for fast lookups
 * @param {TxInput | TxOutput} txInputOutput Tx input or output
 * @param {boolean} isInput Indicates whether to add tx to tx inputs or outputs
 */
const pushTxInputOutputToTxMap = (
  txMap: Map<number, TxEntry>, txInputOutput: TxInput | TxOutput, isInput: boolean,
) : void => {
  const txEntry = txMap.get(txInputOutput.txid)
  if (!txEntry) { return }

  if (isInput) {
    txEntry.ctbInputs.push(initializeTxInputOutputEntry(txInputOutput))
    txEntry.ctbInputSum.getCoin = txEntry.ctbInputSum.getCoin.plus(txInputOutput.value)
  } else {
    txEntry.ctbOutputs.push(initializeTxInputOutputEntry(txInputOutput))
    txEntry.ctbOutputSum.getCoin = txEntry.ctbOutputSum.getCoin.plus(txInputOutput.value)
  }
}

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
  const txMap = new Map(transactions.map(tx => [tx.id, initializeTxEntry(tx)]))
  txInputs.forEach(txInput => pushTxInputOutputToTxMap(txMap, txInput, true))
  txOutputs.forEach(txOutput => pushTxInputOutputToTxMap(txMap, txOutput, false))

  const txList: Array<TxEntry> = [...txMap.values()]
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
  const { rows: txs } = await dbApi.getTransactions(addresses)
  const uniqueTxIds = [...new Set([...txs.map(tx => tx.id)])]

  const { rows: txInputs } = await dbApi.getTxsInputs(uniqueTxIds)
  const { rows: txOutputs } = await dbApi.getTxsOutputs(uniqueTxIds)
  const caTxList = buildTxList(txs, txInputs, txOutputs)

  const addressSet = new Set(addresses)
  const totalInput = sumTxs(txOutputs, addressSet)
  const totalOutput = sumTxs(txInputs, addressSet)

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
  const { rows: txResult } = await dbApi.getTx(wrapHashPrefix(tx))
  if (txResult.length === 0) return { Left: invalidTx }

  const txRow = txResult[0]
  const { rows: blockResult } = await dbApi.getBlockById(txRow.block)
  const blockRow = blockResult[0]

  const { rows: inputs } = await dbApi.getSingleTxInputs(txRow.id)
  const { rows: outputs } = await dbApi.getTxsOutputs([txRow.id])

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
  const { rows: txs } = await dbApi.txSummary(tx)
  if (txs.length === 0) {
    return { Left: invalidTx }
  }
  logger.debug('[txRaw] result calculated')
  return { Right: txs[0].tx_body }
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
  const mappedRows = result.rows.map((row) => (
    {
      ...row, // TODO/hrafn experiment with \x format and transaction signing
      cuCoins: { getCoin: row.cuCoins },
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
