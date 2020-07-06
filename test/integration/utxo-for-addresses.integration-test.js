import { expect } from 'chai'
import shuffle from 'shuffle-array'
import { runInServer, assertOnResults } from './test-utils'

const ENDPOINT = '/v2/txs/utxoForAddresses'

// To avoid Possible EventEmitter memory leak detected message
process.setMaxListeners(0)

describe('UtxoForAddresses endpoint', () => {
  it('should return empty if addresses do not exist', async () =>
    runInServer(api =>
      api
        .post(ENDPOINT)
        .send({
          addresses: [
            'DdzFFzCqrhsfYMUNRxtQ5NNKbWVw3ZJBNcMLLZSoqmD5trHHPBDwsjonoBgw1K6e8Qi8bEMs5Y62yZfReEVSFFMncFYDUHUTMM436KjQ',
            'DdzFFzCqrht4s7speawymCPkm9waYHFSv2zwxhmFqHHQK5FDFt7fd9EBVvm64CrELzxaRGMcygh3gnBrXCtJzzodvzJqVR8VTZqW4rKJ',
          ],
        })
        .expectBody([])
        .end(),
    ))

  it('should return data for addresses balance once even if sent twice', async () => {
    const usedAddresses = [
      'DdzFFzCqrhswkXmoWjcFTDEB3AnAJSqcf7FPsjcesTGfu9zSmCc2Nn2aufdgoQ8zPxQHkdkqfixejHnQejVbm4MQCsd88dCywQqYZEEk',
      'DdzFFzCqrhswkXmoWjcFTDEB3AnAJSqcf7FPsjcesTGfu9zSmCc2Nn2aufdgoQ8zPxQHkdkqfixejHnQejVbm4MQCsd88dCywQqYZEEk',
    ]

    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send({ addresses: usedAddresses })
        .expectBody([{
          utxo_id:
            '2afb190a0b9fe21cb014d5b21ae5321fbb1585cee9a34a9ae87aba05a46472650',
          tx_hash:
            '2afb190a0b9fe21cb014d5b21ae5321fbb1585cee9a34a9ae87aba05a4647265',
          tx_index: 0,
          receiver:
            'DdzFFzCqrhswkXmoWjcFTDEB3AnAJSqcf7FPsjcesTGfu9zSmCc2Nn2aufdgoQ8zPxQHkdkqfixejHnQejVbm4MQCsd88dCywQqYZEEk',
          amount: '390053000000',
          block_num: 27654,
        }])
        .end(),
    )
  })

  it('should filter unused addresses', async () => {
    const usedAddresses = [
      'DdzFFzCqrht7tzd7P6aAWkqiF91p8vLSdBWdnTExD7prn7uojmbDdLVsKBs7hANQDSvGixzVeTTwQXaTqJ4LNLNDkNb69PVqxDZn4fCd',
      'DdzFFzCqrht59BgECpEq8Xtnw95Yz1y1vnLC9kBAh7rr6dcBM2pEfV9nfJoKSCn59uRMPW89xoLSRCaXGehbVzYDVp4CnQmepLE8trrs',
    ]

    const unusedAddresses = [
      'DdzFFzCqrhsfYMUNRxtQ5NNKbWVw3ZJBNcMLLZSoqmD5trHHPBDwsjonoBgw1K6e8Qi8bEMs5Y62yZfReEVSFFMncFYDUHUTMM436KjQ',
      'DdzFFzCqrht4s7speawymCPkm9waYHFSv2zwxhmFqHHQK5FDFt7fd9EBVvm64CrELzxaRGMcygh3gnBrXCtJzzodvzJqVR8VTZqW4rKJ',
      'DdzFFzCqrht8d5FeU62PpBw1e3JLUP48LKfDfNtUyfuBJjBEqmgfYpwcbNHCh3csA4DEzu7SYquoUdmkcknR1E1D6zz5byvpMx632VJx',
    ]

    const expectedUTOXs = [{
      utxo_id:
        '6f63d6bac05093a44712aa6cd0e94d63793a370ffd50bb3f61a0a1ed6fb3482c0',
      tx_hash:
        '6f63d6bac05093a44712aa6cd0e94d63793a370ffd50bb3f61a0a1ed6fb3482c',
      tx_index: 0,
      receiver:
        'DdzFFzCqrht7tzd7P6aAWkqiF91p8vLSdBWdnTExD7prn7uojmbDdLVsKBs7hANQDSvGixzVeTTwQXaTqJ4LNLNDkNb69PVqxDZn4fCd',
      amount: '390384000000',
      block_num: 27655,
    },
    {
      utxo_id:
        '71d2b2fa15d7976e6dabb44e5fcc52eaddb9143271e0f39d26d1e8c29d2172f10',
      tx_hash:
        '71d2b2fa15d7976e6dabb44e5fcc52eaddb9143271e0f39d26d1e8c29d2172f1',
      tx_index: 0,
      receiver:
        'DdzFFzCqrht59BgECpEq8Xtnw95Yz1y1vnLC9kBAh7rr6dcBM2pEfV9nfJoKSCn59uRMPW89xoLSRCaXGehbVzYDVp4CnQmepLE8trrs',
      amount: '2619215000000',
      block_num: 27656,
    }]

    const addresses = shuffle(usedAddresses.concat(unusedAddresses))
    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send({ addresses })
        .expect(
          assertOnResults((res, body) => {
            expect(body).to.have.same.deep.members(expectedUTOXs)
          }),
        )
        .end(),
    )
  })
})
