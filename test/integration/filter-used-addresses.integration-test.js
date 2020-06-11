import { expect } from 'chai'
import shuffle from 'shuffle-array'
import { runInServer, assertOnResults } from './test-utils'

// @flow
// const shuffle = require('shuffle-array')

// To avoid Possible EventEmitter memory leak detected message
process.setMaxListeners(0)

const ENDPOINT = '/v2/addresses/filterUsed'

describe('FilterUsedAddresses endpoint', () => {
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

  it('should return used addresses just once', async () => {
    const usedAddresses = [
      'DdzFFzCqrhsoavpTFBhT1EAo2dDbEr7CcS1925uCTqFbT1B81NdRZcaKM4tyrDfm29iYCym8FJo4BdvSM6rFtmgUCXq6Q8vz718niXp3',
      'DdzFFzCqrhsoavpTFBhT1EAo2dDbEr7CcS1925uCTqFbT1B81NdRZcaKM4tyrDfm29iYCym8FJo4BdvSM6rFtmgUCXq6Q8vz718niXp3',
    ]

    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send({ addresses: usedAddresses })
        .expectBody([usedAddresses[0]])
        .end(),
    )
  })

  it('should filter unused addresses', async () => {
    const usedAddresses = [
      'DdzFFzCqrhszp4fARmEMkgb99btzMKNuYnFMsQHXFZJyDPjPJuu3fi1JHCGgNgLSufYJaP6b7GMtTEprfmSzTQjKqJyneB75y5ABbiSf',
      'DdzFFzCqrhswkXmoWjcFTDEB3AnAJSqcf7FPsjcesTGfu9zSmCc2Nn2aufdgoQ8zPxQHkdkqfixejHnQejVbm4MQCsd88dCywQqYZEEk',
      'DdzFFzCqrht7tzd7P6aAWkqiF91p8vLSdBWdnTExD7prn7uojmbDdLVsKBs7hANQDSvGixzVeTTwQXaTqJ4LNLNDkNb69PVqxDZn4fCd',
      'DdzFFzCqrht2M9W4v5ibT8PjjQCTWh6xSnVwaAGidiGRB1FbF6ZnzKx5V97wXthw5Gfo4L68JJZmNUAWUxjkPXojwHQF9uqxvGeC6wjG',
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
        .expect(
          assertOnResults((res, body) => {
            expect(body).to.have.same.members(usedAddresses)
          }),
        )
        .end(),
    )
  })
})
