// @flow

import { isValidAddress } from 'cardano-crypto.js'
import moment from 'moment'
import Big from 'big.js'
import { _ } from 'lodash'

import type {
  ServerConfig,
  TxInput,
  TxOutput,
  TxInputOutputEntry,
  TxEntry,
  Tx,
  CoinObject,
} from 'icarus-backend'; // eslint-disable-line

const withPrefix = route => `/api${route}`
const invalidAddress = 'Invalid Cardano address!'
const invalidTx = 'Invalid transaction id!'

const arraySum = (
  numbers: Array<Big | number>,
): Big => numbers.reduce((acc: Big, val) => acc.plus(Big(val)), Big(0))
const getCoinObject = (value: Big | number): CoinObject => ({ getCoin: `${Big(value)}` })

/**
 * Database stores all hashes with prefix of '\x'. To hide inner database structure and
 * deal with just the results in common format, these functions wrap and unwrap the hashes.
*/
export const wrapHashPrefix = (hash: string): string => `\\x${hash}`
export const unwrapHashPrefix = (hash: string): string => hash.substr(2)
// retain original order of 'index' of inputs or outputs in a transaction
export const groupInputsOutputs = (
  txInputsOutputs: Array<TxInput> | Array<TxOutput>,
) => _(txInputsOutputs)
  .groupBy(tx => tx.txid)
  .each(group => group.sort((a, b) => a.index - b.index))

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
    .map(tx => initializeTxEntry(tx, txInputMap[tx.id], txOutputMap[tx.id]))
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
  const uniqueTxIds = [...new Set([...txs.map(tx => tx.id)])]

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
  const blockResult = await dbApi.getBlockById(txRow.block)
  const blockRow = blockResult[0]

  const inputs = await dbApi.getSingleTxInputs(txRow.id)
  const outputs = await dbApi.getTxsOutputs([txRow.id])

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
