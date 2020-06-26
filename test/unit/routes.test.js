import assert from 'assert'
import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import sinon from 'sinon'
import Bunyan from 'bunyan'
import { InternalServerError, BadRequestError } from 'restify-errors'
import packageJson from '../../package.json'
import routes from '../../build/routes'

chai.use(chaiAsPromised)
const { expect } = chai

const TX_SENT_SUCCESSFULLY_MESSAGE = 'Transaction sent successfully!'
const TX_REJECTED_MESSAGE = 'Transaction failed protocol: TransactionRejected'
const BAD_WITNESS_MESSAGE = 'Transaction failed verification: BadTxWitness'
const UNKNOWN_ERROR_MESSAGE = 'Unknown Error: Transaction submission failed'
const SIGNED_TX_MISSING_MESSAGE = 'Signed transaction missing'
const INVALID_DATEFROM_MESSAGE = 'DateFrom should be a valid datetime'

// eslint-disable-next-line new-cap
const logger = new Bunyan.createLogger({
  name: 'test',
  // $FlowFixMe Doesn't like string literal
  level: 'fatal',
})

const apiConfig = { addressesRequestLimit: 50, txHistoryResponseLimit: 20 }

function mockAxiosError(response) {
  const result = new Error()
  result.response = response

  return result
}

describe('Routes', () => {
  // This returns fake data. It's ok if they are not real objects (for example utxo or txs)
  // as we are checking the response is being returned, not the queries
  const dbApi = {
    filterUsedAddresses: sinon.fake.resolves({ rows: [['a1', 'a2']] }),
    utxoForAddresses: sinon.fake.resolves({ rows: ['utxo1', 'utxo2'] }),
    utxoSumForAddresses: sinon.fake.resolves({ rows: [10, 20] }),
    transactionsHistoryForAddresses: sinon.fake.resolves({
      rows: ['tx1', 'tx2'],
    }),
    unspentAddresses: sinon.fake.resolves([]),
  }

  function validateMethodAndPath(endpoint, methodToCheck, pathToCheck) {
    const { method, path } = endpoint
    assert.equal(methodToCheck, method)
    assert.equal(pathToCheck, path)
  }

  function assertInvalidAddressesPayload(handler) {
    it('should reject bodies without addresses', () => {
      // $FlowFixMe Ignore this as we are trying invalid payloads
      const response = handler({})
      return expect(response).to.be.rejectedWith(
        Error,
        `Addresses request length should be (0, ${
          apiConfig.addressesRequestLimit
        }]`,
      )
    })

    it(`should reject bodies with more than ${
      apiConfig.addressesRequestLimit
    } addresses`, () => {
      const response = handler(
        // $FlowFixMe Ignore this as we are trying invalid payloads
        { body: { addresses: Array(apiConfig.addressesRequestLimit + 1).fill('an_address') } },
      )
      return expect(response).to.be.rejectedWith(
        BadRequestError,
        `Addresses request length should be (0, ${
          apiConfig.addressesRequestLimit
        }]`,
      )
    })
  }

  describe('Healthcheck', () => {
    it('should have GET as method and /api/v2/healthcheck as path', () => {
      validateMethodAndPath(routes.healthcheck, 'get', '/api/v2/healthcheck')
    })

    it('should return package.json version as response', async () => {
      const handler = routes.healthcheck.handler()
      const response = await handler()
      return expect(response).to.eql({ version: packageJson.version })
    })
  })

  describe('Filter Used Addresses', () => {
    it('should have POST as method and /api/v2/addresses/filterUsed as path', () => {
      validateMethodAndPath(
        routes.filterUsedAddresses,
        'post',
        '/api/v2/addresses/filterUsed',
      )
    })

    assertInvalidAddressesPayload(
      routes.filterUsedAddresses.handler(dbApi, { logger, apiConfig }),
    )

    it('should accept bodies with 20 addresses', async () => {
      const handler = routes.filterUsedAddresses.handler(dbApi, {
        logger,
        apiConfig,
      })
      const response = await handler({
        body: { addresses: Array(20).fill('an_address') },
      })
      return expect(response).to.eql(['a1', 'a2'])
    })
  })

  describe('UTXO for addresses', () => {
    it('should have POST as method and /api/v2/txs/utxoForAddresses as path', () => {
      validateMethodAndPath(
        routes.utxoForAddresses,
        'post',
        '/api/v2/txs/utxoForAddresses',
      )
    })

    assertInvalidAddressesPayload(
      routes.utxoForAddresses.handler(dbApi, { logger, apiConfig }),
    )

    // it('should accept bodies with 20 addresses', async () => {
    //   const handler = routes.utxoForAddresses.handler(dbApi, {
    //     logger,
    //     apiConfig,
    //   })
    //   const response = await handler({
    //     body: { addresses: Array(20).fill('an_address') },
    //   })
    //   return expect(response).to.eql(['utxo1', 'utxo2'])
    // }) TODO/hrafn rework this atrocity
  })

  describe('UTXO Sum for addresses', () => {
    it('should have POST as method and api/v2//txs/utxoSumForAddresses as path', () => {
      validateMethodAndPath(
        routes.utxoSumForAddresses,
        'post',
        '/api/v2/txs/utxoSumForAddresses',
      )
    })

    assertInvalidAddressesPayload(
      routes.utxoSumForAddresses.handler(dbApi, { logger, apiConfig }),
    )

    it('should accept bodies with 20 addresses', async () => {
      const handler = routes.utxoSumForAddresses.handler(dbApi, {
        logger,
        apiConfig,
      })
      const response = await handler({
        body: { addresses: Array(20).fill('an_address') },
      })
      return expect(response).to.equal(10)
    })
  })

  describe('Transactions history', () => {
    it('should have POST as method and /api/v2/txs/history as path', () => {
      validateMethodAndPath(
        routes.transactionsHistory,
        'post',
        '/api/v2/txs/history',
      )
    })

    assertInvalidAddressesPayload(
      routes.transactionsHistory.handler(dbApi, { logger, apiConfig }),
    )

    it('should fail if no dateFrom sent', async () => {
      const handler = routes.transactionsHistory.handler(dbApi, {
        logger,
        apiConfig,
      })
      const response = handler({
        body: {
          addresses: ['an_address'],
          // $FlowFixMe ignore this line as we are testing invalid dateFrom
          dateFrom: undefined,
        },
      })
      return expect(response).to.be.rejectedWith(
        BadRequestError,
        INVALID_DATEFROM_MESSAGE,
      )
    })
  })

  describe('Signed Transaction', () => {
    it('should have POST as method and /api/v2/txs/signed as path', () => {
      validateMethodAndPath(
        routes.signedTransaction,
        'post',
        '/api/v2/txs/signed',
      )
    })

    it('should send a given signed tx', async () => {
      const importerApi = {
        sendTx: sinon.fake.resolves({ status: 200, data: TX_SENT_SUCCESSFULLY_MESSAGE }),
      }
      const handler = routes.signedTransaction.handler(dbApi, {
        logger,
      }, importerApi)
      const response = await handler({ body: { signedTx: 'signedTx' } })
      return expect(response).to.equal(TX_SENT_SUCCESSFULLY_MESSAGE)
    })

    it('should reject empty bodies', async () => {
      const importerApi = {
        sendTx: sinon.fake.resolves(),
      }
      const handler = routes.signedTransaction.handler(dbApi, {
        logger,
      }, importerApi)
      // $FlowFixMe Ignore this error as we are testing invalid payload
      const request = handler({ body: { signedTx: undefined } })
      return expect(request).to.be.rejectedWith(
        BadRequestError,
        SIGNED_TX_MISSING_MESSAGE,
      )
    })

    it('should reject on importer error', async () => {
      const importerApi = {
        sendTx: sinon.fake.rejects(),
      }
      const handler = routes.signedTransaction.handler(dbApi, {
        logger,
      }, importerApi)
      // $FlowFixMe Ignore this error as we are testing invalid payload
      const request = handler({ body: { signedTx: 'fakeSignedTx' } })
      return expect(request).to.be.rejectedWith(
        InternalServerError,
        UNKNOWN_ERROR_MESSAGE,
      )
    })

    it('should reject on invalid transaction', async () => {
      const importerApi = {
        sendTx: sinon.fake.rejects(mockAxiosError({
          status: 400,
          data: TX_REJECTED_MESSAGE,
        })),
      }
      const handler = routes.signedTransaction.handler(dbApi, {
        logger,
      }, importerApi)
      // $FlowFixMe Ignore this error as we are testing invalid payload
      const request = handler({ body: { signedTx: 'fakeSignedTx' } })
      return expect(request).to.be.rejectedWith(
        BadRequestError,
        TX_REJECTED_MESSAGE,
      )
    })

    it('should reject on invalid witness', async () => {
      const importerApi = {
        sendTx: sinon.fake.rejects(mockAxiosError({
          status: 400,
          data: BAD_WITNESS_MESSAGE,
        })),
      }
      const handler = routes.signedTransaction.handler(dbApi, {
        logger,
      }, importerApi)
      const request = handler({ body: { signedTx: 'fakeSignedTx' } })
      return expect(request).to.be.rejectedWith(
        BadRequestError,
        BAD_WITNESS_MESSAGE,
      )
    })
  })
})
