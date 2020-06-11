/* eslint-disable max-len */
import { expect } from 'chai'
// import shuffle from 'shuffle-array'
import { runInServer, assertOnResults } from '../test-utils'

const ENDPOINT = '/bulk/addresses/summary'

describe('BulkAddressSummary endpoint', () => {
  it('should return left if addresses are empty', async () =>
    runInServer(api =>
      api
        .post(ENDPOINT)
        .send()
        .expectBody({ Left: 'Addresses request length should be (0, 50]' })
        .end(),
    ))

  it('should return left if an address is invalid', async () =>
    runInServer(api =>
      api
        .post(ENDPOINT)
        .send([
          'InvalidDdzFFzCqrhshvqw9GrHmSw6ySwViBj5cj2njWj5mbnLu4uNauJCKuXhHS3wNUoGRNBGGTkyTFDQNrUWMumZ3mxarAjoXiYvyhead7yKQ',
          'DdzFFzCqrhshvqw9GrHmSw6ySwViBj5cj2njWj5mbnLu4uNauJCKuXhHS3wNUoGRNBGGTkyTFDQNrUWMumZ3mxarAjoXiYvyhead7yKQ',
        ])
        .expectBody({ Left: 'Invalid Cardano address!' })
        .end(),
    ))

  it('should return empty if addresses do not exist', async () => {
    const expectedAddressSummary = {
      Right: {
        caAddresses:
          ['DdzFFzCqrhshvqw9GrHmSw6ySwViBj5cj2njWj5mbnLu4uNauJCKuXhHS3wNUoGRNBGGTkyTFDQNrUWMumZ3mxarAjoXiYvyhead7yKQ',
            'DdzFFzCqrht7HGoJ87gznLktJGywK1LbAJT2sbd4txmgS7FcYLMQFhawb18ojS9Hx55mrbsHPr7PTraKh14TSQbGBPJHbDZ9QVh6Z6Di'],
        caTxNum: 0,
        caBalance: { getCoin: '0' },
        caTxList: [],
      },
    }
    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send([
          'DdzFFzCqrhshvqw9GrHmSw6ySwViBj5cj2njWj5mbnLu4uNauJCKuXhHS3wNUoGRNBGGTkyTFDQNrUWMumZ3mxarAjoXiYvyhead7yKQ',
          'DdzFFzCqrht7HGoJ87gznLktJGywK1LbAJT2sbd4txmgS7FcYLMQFhawb18ojS9Hx55mrbsHPr7PTraKh14TSQbGBPJHbDZ9QVh6Z6Di',
        ])
        .expectBody(expectedAddressSummary)
        .end(),
    )
  })
})
