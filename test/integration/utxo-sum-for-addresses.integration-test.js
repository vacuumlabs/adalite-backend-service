import shuffle from 'shuffle-array'
import { runInServer } from './test-utils'

const ENDPOINT = '/v2/txs/utxoSumForAddresses'

describe('UtxoSumForAddresses endpoint', () => {
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
        .expectValue('sum', null)
        .end(),
    ))

  it('should sum addresses balance once even if sent twice', async () => {
    const usedAddresses = [
      'DdzFFzCqrhswkXmoWjcFTDEB3AnAJSqcf7FPsjcesTGfu9zSmCc2Nn2aufdgoQ8zPxQHkdkqfixejHnQejVbm4MQCsd88dCywQqYZEEk',
      'DdzFFzCqrhswkXmoWjcFTDEB3AnAJSqcf7FPsjcesTGfu9zSmCc2Nn2aufdgoQ8zPxQHkdkqfixejHnQejVbm4MQCsd88dCywQqYZEEk',
    ]

    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send({ addresses: usedAddresses })
        .expectValue('sum', '390053000000')
        .end(),
    )
  })

  it('should filter unused addresses', async () => {
    const usedAddresses = [
      'DdzFFzCqrhswkXmoWjcFTDEB3AnAJSqcf7FPsjcesTGfu9zSmCc2Nn2aufdgoQ8zPxQHkdkqfixejHnQejVbm4MQCsd88dCywQqYZEEk',
    ]

    const unusedAddresses = [
      'DdzFFzCqrhsfYMUNRxtQ5NNKbWVw3ZJBNcMLLZSoqmD5trHHPBDwsjonoBgw1K6e8Qi8bEMs5Y62yZfReEVSFFMncFYDUHUTMM436KjQ',
      'DdzFFzCqrht4s7speawymCPkm9waYHFSv2zwxhmFqHHQK5FDFt7fd9EBVvm64CrELzxaRGMcygh3gnBrXCtJzzodvzJqVR8VTZqW4rKJ',
      'DdzFFzCqrht8d5FeU62PpBw1e3JLUP48LKfDfNtUyfuBJjBEqmgfYpwcbNHCh3csA4DEzu7SYquoUdmkcknR1E1D6zz5byvpMx632VJx',
    ]

    const addresses = shuffle(usedAddresses.concat(unusedAddresses))
    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send({ addresses })
        .expectValue('sum', '390053000000')
        .end(),
    )
  })
})
