// @flow

import type { Logger } from 'bunyan'
import type {
  ServerConfig,
  Request,
  AccountRequest,
  TxHistoryRequest,
  SignedTxRequest,
  DbApi,
  ImporterApi,
} from 'icarus-backend'; // eslint-disable-line

import { 
  InternalError,
  InternalServerError,
  NotFoundError,
  ServiceUnavailableError,
  BadRequestError
} from 'restify-errors'
import moment from 'moment'
import axios from 'axios'
import { version } from '../package.json'
import { getInstanceHealthStatus } from './healthcheck'
import config from './config'

const serverConfig = config.get('server')
const withPrefix = route => `/api/v2${route}`

/**
 * This method validates addresses request body
 * @param {Array[String]} addresses
 */
function validateAddressesReq(addressRequestLimit: number, { addresses } = {}) {
  if (!addresses || addresses.length > addressRequestLimit || addresses.length === 0) {
    throw new Error(`Addresses request length should be (0, ${addressRequestLimit}]`)
  }
  // TODO: Add address validation
  return true
}

/**
 * This method validates dateFrom sent as request body is valid datetime
 * @param {String} dateFrom DateTime as String
 */
function validateDatetimeReq({ dateFrom } = {}) {
  if (!dateFrom || !moment(dateFrom).isValid()) {
    throw new Error('DateFrom should be a valid datetime')
  }
  return true
}

/**
 * This method validates signedTransaction endpoint body in order to check
 * if signedTransaction is received ok and is valid
 * @param {Object} Signed Transaction Payload
 */
function validateSignedTransactionReq({ signedTx } = {}) {
  if (!signedTx) {
    throw new Error('Signed transaction missing')
  }
  // TODO: Add Transaction signature validation or other validations
  return true
}

/**
 * Function to ensure account request is not empty
 * @param {Account} account
 */
function validateAccount({ account } = {}) {
  if (!account) {
    throw new Error('Account is empty.')
  }
}

const checkJormunSync = async () => {
  const isOk = await axios.get(serverConfig.healthcheckUrl)
    .then(response => response.data.is_ok === true)
    .catch(() => {
      throw new InternalError('Healthcheck down.')
    })

  return isOk
}

/**
 * Checks for existence of group addresses which should not be explicitly requested
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const checkForGroupAddress = (dbApi: DbApi, { logger }: ServerConfig) => async (
  addresses,
) => {
  const containsGroupAddress = await dbApi.hasGroupAddress(addresses)
  if (containsGroupAddress) {
    logger.debug('[checkForGroupAddress] request contains group address - aborting')
    throw new BadRequestError('Request contains group address')
  }
}

/**
 * Endpoint to handle getting UTXOs for given addresses
 * @param {*} db Database
 * @param {*} Server Server Config object
 */
const utxoForAddresses = (dbApi: DbApi, { logger, apiConfig }: ServerConfig) => async (
  req: Request,
) => {
  validateAddressesReq(apiConfig.addressesRequestLimit, req.body)
  logger.debug('[utxoForAddresses] request is valid')
  const result = await dbApi.utxoForAddresses(req.body.addresses)
  logger.debug('[utxoForAddresses] result calculated')
  return result.rows
}

/**
 * This endpoint filters the given addresses returning the ones that were
 * used at least once
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const filterUsedAddresses = (dbApi: DbApi, { logger, apiConfig }: ServerConfig) => async (
  req: Request,
) => {
  validateAddressesReq(apiConfig.addressesRequestLimit, req.body)
  logger.debug('[filterUsedAddresses] request is valid')
  await checkForGroupAddress(dbApi, serverConfig)(req.body.addresses)
  const result = await dbApi.filterUsedAddresses(req.body.addresses)
  logger.debug('[filterUsedAddresses] result calculated')
  return result.rows.reduce((acc, row) => acc.concat(row), [])
}

/**
 * Endpoint to handle getting Tx History for given addresses and Date Filter
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const utxoSumForAddresses = (dbApi: DbApi, { logger, apiConfig }: ServerConfig) => async (
  req: Request,
) => {
  validateAddressesReq(apiConfig.addressesRequestLimit, req.body)
  logger.debug('[utxoSumForAddresses] request is valid')
  const result = await dbApi.utxoSumForAddresses(req.body.addresses)
  logger.debug('[utxoSumForAddresses] result calculated')
  return result.rows[0]
}

/**
 *
 * @param {*} db Database
 * @param {*} Server Config Object
 */
const transactionsHistory = (dbApi: DbApi, { logger, apiConfig }: ServerConfig) => async (
  req: TxHistoryRequest,
) => {
  validateAddressesReq(apiConfig.addressesRequestLimit, req.body)
  validateDatetimeReq(req.body)
  logger.debug('[transactionsHistory] request is valid')
  const result = await dbApi.transactionsHistoryForAddresses(
    apiConfig.historyResponseLimit,
    req.body.addresses,
    moment(req.body.dateFrom).toDate(),
  )
  logger.debug('[transactionsHistory] result calculated')
  return result.rows
}

const retrySync = async (maxRetries: number) => {
  let retries = 0
  while (retries < maxRetries) {
    const isSync = await checkJormunSync() // eslint-disable-line
    if (isSync) {
      return true
    }
    retries += 1
  }

  return false
}

/**
 * Broadcasts a signed transaction to the block-importer node
 * @param {*} db Database
 * @param {*} Server Server Config object
 */
const signedTransaction = (
  dbApi: DbApi,
  {
    logger,
  }: { logger: Logger },
  importerApi: ImporterApi,
) => async (req: SignedTxRequest) => {
  validateSignedTransactionReq(req.body)
  logger.debug('[signedTransaction] request start')

  const isJormunSynced = await retrySync(3)
  if (!isJormunSynced) {
    logger.debug('[signedTransaction] Jormungandr node is not in sync.')
    throw new InternalServerError('Jormungandr node is not in sync.')
  }

  let response
  try {
    response = await importerApi.sendTx(req.body)
  } catch (err) {
    logger.debug('[signedTransaction] Error trying to connect with importer')
    throw new InternalError('Error trying to connect with importer', err)
  }
  logger.debug('[signedTransaction] transaction sent to backend, response:', response)
  if (response.status === 200) {
    if (response.data === '@Ok') {
      return 'Transaction sent successfully!'
    }

    logger.debug('[signedTransaction] Unknown response from backend')
    throw new InternalServerError('Unknown response from backend.', response)
  }

  logger.error(
    '[signedTransaction] Error while doing request to backend',
    response,
  )
  throw new Error(`Error trying to send transaction ${response.data}`)
}

/**
 * This endpoint returns the last block stored in the database.
 * @param {*} db Database
 * @param {*} Server Config Object
 */
const bestBlock = (dbApi: DbApi) => async () => {
  const result = await dbApi.bestBlock()
  return { Right: { bestBlock: result } }
}

const parseResults = (rows, ratios) => {
  if (rows.length === 0) {
    return []
  }

  return rows.map(row => (
    {
      ...row,
      // info: JSON.parse(row.info),
      ratio: ratios[row.pool_id],
    }
  ))
}

/**
 * jormun node returns delegation info in format [[pool_id1, ratio1], [pool_id2, ratio2]],
 * convert this into object
*/
const mapRatios = (poolValuePairs) => {
  return poolValuePairs.reduce((obj, [key, val]) => {
    obj[key] = val
    return obj
  }, {})
}

/**
 * Endpoint for getting information for a specific account from node. Proxied to 
 * jormungandr for now.
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const accountInfo = (
  dbApi: DbApi, { logger }: { logger: Logger },
) => async (req: AccountRequest) => {
  validateAccount(req.body)
  const res = await axios.get(`${serverConfig.jormun}/api/v0/account/${req.body.account}`) // eslint-disable-line
    .then(response => response.data)
    .catch(err => {
      logger.debug(err)

      if (err.response && err.response.status === 503) {
        throw new ServiceUnavailableError('Jormungandr node down.')
      }

      throw new NotFoundError('Account not found in blockchain.')
    })

  const poolIds = res.delegation ? res.delegation.pools.map(pool => pool[0]) : []
  const poolRatios = res.delegation ? mapRatios(res.delegation.pools) : {}

  const poolInfo = await dbApi.bulkStakePoolInfo(poolIds)
  const ratioDelegations = parseResults(poolInfo.rows, poolRatios)
  logger.debug('[accountInfo] request calculated')

  return {
    ...res,
    delegation: ratioDelegations,
  }
}

/**
 * Endpoint for getting information for all stake pools and their details
 * @param {*} db Database
 * @param {*} Server Server Config Object
 */
const stakePools = (dbApi: DbApi, { logger }: ServerConfig) => async () => {
  logger.debug('[stakePools] query started')
  const result = await dbApi.stakePoolsDetailed()
  logger.debug('[stakePools] query finished')
  return result.rows
}

/**
 * Endpoint for getting delegation history for specified account
 * @param {*} db Database
 * @param {*} Server Config Object
 */
const delegationHistory = (dbApi: DbApi, { logger, apiConfig }: ServerConfig) => async (
  req: AccountRequest,
) => {
  validateAccount(req.body)
  logger.debug('[delegationHistory] request is valid')
  const result = await dbApi.delegationHistoryForAccount(
    apiConfig.historyResponseLimit,
    req.body.account,
  )
  logger.debug('[delegationHistory] result calculated')
  return result.rows
}

/**
 * This endpoint returns the current deployed version. The goal of this endpoint is to
 * be used by monitoring tools to check service availability.
 * @param {*} req
 * @param {*} res
 * @param {*} next
 */
const healthcheck = () => () => Promise.resolve({ version })
const getHealthStatus = () => () => Promise.resolve(getInstanceHealthStatus())

export default {
  healthcheck: {
    method: 'get',
    path: withPrefix('/healthcheck'),
    handler: healthcheck,
  },
  healthStatus: {
    method: 'get',
    path: withPrefix('/healthStatus'),
    handler: getHealthStatus,
  },
  bestBlock: {
    method: 'get',
    path: withPrefix('/bestBlock'),
    handler: bestBlock,
  },
  filterUsedAddresses: {
    method: 'post',
    path: withPrefix('/addresses/filterUsed'),
    handler: filterUsedAddresses,
  },
  utxoForAddresses: {
    method: 'post',
    path: withPrefix('/txs/utxoForAddresses'),
    handler: utxoForAddresses,
  },
  utxoSumForAddresses: {
    method: 'post',
    path: withPrefix('/txs/utxoSumForAddresses'),
    handler: utxoSumForAddresses,
  },
  transactionsHistory: {
    method: 'post',
    path: withPrefix('/txs/history'),
    handler: transactionsHistory,
  },
  signedTransaction: {
    method: 'post',
    path: withPrefix('/txs/signed'),
    handler: signedTransaction,
  },
  stakePools: {
    method: 'get',
    path: withPrefix('/stakePools'),
    handler: stakePools,
  },
  accountInfo: {
    method: 'post',
    path: withPrefix('/account/info'),
    handler: accountInfo,
  },
  delegationHistory: {
    method: 'post',
    path: withPrefix('/account/delegationHistory'),
    handler: delegationHistory,
  },
}
