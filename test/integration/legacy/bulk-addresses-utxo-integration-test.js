/* eslint-disable max-len */
import { runInServer } from '../test-utils'

const ENDPOINT = '/bulk/addresses/utxo'

describe('UtxoForAddresses endpoint', () => {
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

  it('should return empty if addresses do not exist', async () =>
    runInServer(api =>
      api
        .post(ENDPOINT)
        .send([
          'DdzFFzCqrhshvqw9GrHmSw6ySwViBj5cj2njWj5mbnLu4uNauJCKuXhHS3wNUoGRNBGGTkyTFDQNrUWMumZ3mxarAjoXiYvyhead7yKQ',
          'DdzFFzCqrhshvqw9GrHmSw6ySwViBj5cj2njWj5mbnLu4uNauJCKuXhHS3wNUoGRNBGGTkyTFDQNrUWMumZ3mxarAjoXiYvyhead7yKQ',
        ])
        .expectBody({ Right: [] })
        .end(),
    ))

  it('should return data for addresses balance once even if sent twice', async () => {
    const usedAddresses = [
      'DdzFFzCqrhsoavpTFBhT1EAo2dDbEr7CcS1925uCTqFbT1B81NdRZcaKM4tyrDfm29iYCym8FJo4BdvSM6rFtmgUCXq6Q8vz718niXp3',
      'DdzFFzCqrhsoavpTFBhT1EAo2dDbEr7CcS1925uCTqFbT1B81NdRZcaKM4tyrDfm29iYCym8FJo4BdvSM6rFtmgUCXq6Q8vz718niXp3',
    ]

    const expectedUTOXs = {
      Right: [{
        tag: 'CUtxo',
        cuId:
          'ea8b8577cb8c4b0e88bee2ff29b4b512fe6469623edb470266e8f78ed6b00322',
        cuOutIndex: 1,
        cuAddress:
          'DdzFFzCqrhsoavpTFBhT1EAo2dDbEr7CcS1925uCTqFbT1B81NdRZcaKM4tyrDfm29iYCym8FJo4BdvSM6rFtmgUCXq6Q8vz718niXp3',
        cuCoins: { getCoin: '10000000' },
      },
      {
        tag: 'CUtxo',
        cuId:
          '0ad85f6b0738d5ac3b02216c36b62b4d8ffc5d079aff4324d97744aa16cab8ea',
        cuOutIndex: 1,
        cuAddress:
          'DdzFFzCqrhsoavpTFBhT1EAo2dDbEr7CcS1925uCTqFbT1B81NdRZcaKM4tyrDfm29iYCym8FJo4BdvSM6rFtmgUCXq6Q8vz718niXp3',
        cuCoins: { getCoin: '330580600000' },
      }],
    }

    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send(usedAddresses)
        .expectBody(expectedUTOXs)
        .end(),
    )
  })
})
