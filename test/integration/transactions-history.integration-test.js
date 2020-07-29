import { expect } from 'chai'
import moment from 'moment'
import shuffle from 'shuffle-array'
import { runInServer, assertOnResults } from './test-utils'

const ENDPOINT = '/v2/txs/history'

// To avoid Possible EventEmitter memory leak detected message
process.setMaxListeners(0)

const expectedTxHistoryExample = [{
  hash:
    'e4c15e3db742a7e4221d8292b083594cb2fd2c500e35cc84b5c6dccf61f1e48a',
  inputs_address:
    ['DdzFFzCqrhsseB5YtzP1h11ttpzJ3EYVaLri1j2HsktAfKEWcxgdSgDoSpyp1j9ac4kHewFAaKKB6DRrd7NgdyuA5JvL2GDtCEcVTbSc'],
  inputs_amount: ['403885460194'],
  outputs_address:
    ['DdzFFzCqrht6SJ6PHQnxzFkrqCVXxG2rfZLGgXyzV5e5LQyLy64TrGeWf3Gm3bRDzoDKJ3pmyj2SLdi4C6MVZqwmA9HsBmvDNP9XHYjc',
      'DdzFFzCqrht37kjZfpjxNHScXnQoRVZMcsw3CrDXnfYCtcmHHfxYUzfn78KrvBDvibB4meDBMLpMdpkqtDMQahDHKECHostfqSSq7uD2'],
  outputs_amount: ['303885288948', '100000000000'],

  block_num: '33947',
  block_hash:
    '40f032cb0ce4d1428a510081fa64ecb2e1f0e4031db377dcd5fbba57a0f41dbd',
  time: '2017-10-01T16:26:31.000Z',
  tx_state: 'Successful',
  last_update: '2017-10-01T16:26:31.000Z',
  tx_ordinal: 0,
  inputs: [{
    address:
      'DdzFFzCqrhsseB5YtzP1h11ttpzJ3EYVaLri1j2HsktAfKEWcxgdSgDoSpyp1j9ac4kHewFAaKKB6DRrd7NgdyuA5JvL2GDtCEcVTbSc',
    amount: '403885460194',
    id:
      '4ee029a099a3392fc50beac679e6da10c9d1da344142852af7ef36c34e47eb600',
    index: 0,
    txHash:
      '4ee029a099a3392fc50beac679e6da10c9d1da344142852af7ef36c34e47eb60',
  }],
  best_block_num: '36119',
},
{
  hash:
    '44c076dc421227dca789554d10da42e95896881ff34e2168ce24a83bf9868cbf',
  inputs_address:
    ['DdzFFzCqrht6SJ6PHQnxzFkrqCVXxG2rfZLGgXyzV5e5LQyLy64TrGeWf3Gm3bRDzoDKJ3pmyj2SLdi4C6MVZqwmA9HsBmvDNP9XHYjc'],
  inputs_amount: ['303885288948'],
  outputs_address:
    ['DdzFFzCqrhseZLwWkBfcf7w3hUyngK7QT5HEUTYEsFuMcoR2Y1ZhEBkvGQWPhgRLW6X7HJcgnbQ8djZWPP8iR3YXLYnK4LebRERKZDRE',
      'DdzFFzCqrht37kjZfpjxNHScXnQoRVZMcsw3CrDXnfYCtcmHHfxYUzfn78KrvBDvibB4meDBMLpMdpkqtDMQahDHKECHostfqSSq7uD2'],
  outputs_amount: ['153885117702', '150000000000'],
  block_num: '33966',
  block_hash:
    '67fb1cc8e3451ba9a1544fcce5df268467d64f364f51706ee730bd43d394afcd',
  time: '2017-10-01T16:32:51.000Z',
  tx_state: 'Successful',
  last_update: '2017-10-01T16:32:51.000Z',
  tx_ordinal: 2,
  inputs: [{
    address:
      'DdzFFzCqrht6SJ6PHQnxzFkrqCVXxG2rfZLGgXyzV5e5LQyLy64TrGeWf3Gm3bRDzoDKJ3pmyj2SLdi4C6MVZqwmA9HsBmvDNP9XHYjc',
    amount: '303885288948',
    id:
      'e4c15e3db742a7e4221d8292b083594cb2fd2c500e35cc84b5c6dccf61f1e48a0',
    index: 0,
    txHash:
      'e4c15e3db742a7e4221d8292b083594cb2fd2c500e35cc84b5c6dccf61f1e48a',
  }],
  best_block_num: '36119',
}]

const usedAndUnusedHistory = [{
  hash:
    'ad1224bf89df3310504fcf6311865f8dc1459a6af283302df7a927945a565eef',
  inputs_address:
    ['DdzFFzCqrhsnqRJvYwPgrf6MG7GKg2iyABiG5QZpN5fTdnoGLYSfiLybttVsovWVmZKgQthLrKfQirfLzmpa3mEJHM1ywjk5V7qTWHFq'],
  inputs_amount: ['82892096000000'],
  outputs_address:
    ['DdzFFzCqrhseyiRj2yMRWzcTMVBywt6cpYjby2mJKCFqapoifhSif2TVMsXdGx5JfZ87hcVbuJ8JtSZ9nQ53s4Zm1kEM23Xp9BzPa1Be',
      'DdzFFzCqrhsnTrHkdrNAyvp2DtuXEsiVBe1mDF3h3BPEn7asRDQYx1e2VrgkeVnvDxcdUqnseeemix8EWXvme66ibu1LcnpYuXhECupo'],
  outputs_amount: ['39814735357517', '43077360471237'],
  block_num: '23671',
  block_hash:
    'c730fdb6985d86accdd353388c6cda38ba27ab9b70d8ae2d8484915ff7819c33',
  time: '2017-09-29T07:19:31.000Z',
  tx_state: 'Successful',
  last_update: '2017-09-29T07:19:31.000Z',
  tx_ordinal: 0,
  inputs:
    [{
      address:
        'DdzFFzCqrhsnqRJvYwPgrf6MG7GKg2iyABiG5QZpN5fTdnoGLYSfiLybttVsovWVmZKgQthLrKfQirfLzmpa3mEJHM1ywjk5V7qTWHFq',
      amount: '82892096000000',
      id:
        'f79e8be4aa489c6ce5cdcdda703fa66bc763891623da1edda92d0c63bee124dc1',
      index: 1,
      txHash:
        'f79e8be4aa489c6ce5cdcdda703fa66bc763891623da1edda92d0c63bee124dc'
    }],
  best_block_num: '36119',
},
{
  hash:
    '854ccf1e7c03785e1a6cb63cd64dcc60664e0de5507b7c7ca68a67235f974e2c',
  inputs_address:
    ['DdzFFzCqrhseyiRj2yMRWzcTMVBywt6cpYjby2mJKCFqapoifhSif2TVMsXdGx5JfZ87hcVbuJ8JtSZ9nQ53s4Zm1kEM23Xp9BzPa1Be'],
  inputs_amount: ['39814735357517'],
  outputs_address:
    ['DdzFFzCqrhst5P2ad1PTMeNV9rx2AkggPpxBmve7QS5wwsk8Y8NpLMDrSLs8eCL6DfgxBZFKveyd7aNZiutjq93dZe5xymyBfZ6JAWEv',
      'DdzFFzCqrhswL73hsVsBoWtF9YUwxYSoHJgWTafoHXM5GUyJUmSTdsf48Kq11sQBY4YNvo2s1BJwtDXm7nd7mkxzb3BTh51FRzgttRNy'],
  outputs_amount: ['30338506008364', '9476229177907'],
  block_num: '23682',
  block_hash:
    'dddd162ce0aa08788246b672b6a2b05ba613e67feb7a3f0da5a10c3ce30f343a',
  time: '2017-09-29T07:23:11.000Z',
  tx_state: 'Successful',
  last_update: '2017-09-29T07:23:11.000Z',
  tx_ordinal: 0,
  inputs:
    [{
      address:
        'DdzFFzCqrhseyiRj2yMRWzcTMVBywt6cpYjby2mJKCFqapoifhSif2TVMsXdGx5JfZ87hcVbuJ8JtSZ9nQ53s4Zm1kEM23Xp9BzPa1Be',
      amount: '39814735357517',
      id:
        'ad1224bf89df3310504fcf6311865f8dc1459a6af283302df7a927945a565eef0',
      index: 0,
      txHash:
        'ad1224bf89df3310504fcf6311865f8dc1459a6af283302df7a927945a565eef'
    }],
  best_block_num: '36119',
},
{
  hash:
    'a395ef658ccbe662a798dfc7596c1dae5a601aad32f81699290941e0824df726',
  inputs_address:
    ['DdzFFzCqrhtAeEuBmn8FGThzvQwChcakTrGume323jmwPs5nU4PURMLv7UbgqMrLqGMw8AX6jnfh83L57bfeMFsSi4UwaJoYwe7fBHtQ'],
  inputs_amount: ['383069000000'],
  outputs_address:
    ['DdzFFzCqrhsuwnRg1KY28gErSuA4UB2wBsiQwFmtetjdA8UKEmxGpEkAhtQ9EWRJMbMdvZ4mqXfCNEWwDFutskRmon1MVZ2eY4cGtBAP',
      'DdzFFzCqrhsi32aUzkACCxTudtkcvCWT8n41UUB8djQBaW26wsb6MoXHP4rzAdUGQeF7BJZGyz9NdS7sJ7zzL8skNMREb2rZr2HnNGWG'],
  outputs_amount: ['62', '383068829000'],
  block_num: '30719',
  block_hash:
    'b05a55f2c6ed351f2d053bfe298869c027070abbe93b57d4e1fb0d81f6773687',
  time: '2017-09-30T22:29:51.000Z',
  tx_state: 'Successful',
  last_update: '2017-09-30T22:29:51.000Z',
  tx_ordinal: 0,
  inputs:
    [{
      address:
        'DdzFFzCqrhtAeEuBmn8FGThzvQwChcakTrGume323jmwPs5nU4PURMLv7UbgqMrLqGMw8AX6jnfh83L57bfeMFsSi4UwaJoYwe7fBHtQ',
      amount: '383069000000',
      id:
        '4dc65dc59a0a86f869e4a5c814bc647cd5f9d398e17a5c72d4af3b73028ea0e30',
      index: 0,
      txHash:
        '4dc65dc59a0a86f869e4a5c814bc647cd5f9d398e17a5c72d4af3b73028ea0e3'
    }],
  best_block_num: '36119',
}]

describe('Transaction History endpoint', () => {
  it('should return empty if addresses do not exist', async () =>
    runInServer(api =>
      api
        .post(ENDPOINT)
        .send({
          addresses: [
            'DdzFFzCqrhsfYMUNRxtQ5NNKbWVw3ZJBNcMLLZSoqmD5trHHPBDwsjonoBgw1K6e8Qi8bEMs5Y62yZfReEVSFFMncFYDUHUTMM436KjQ',
            'DdzFFzCqrht4s7speawymCPkm9waYHFSv2zwxhmFqHHQK5FDFt7fd9EBVvm64CrELzxaRGMcygh3gnBrXCtJzzodvzJqVR8VTZqW4rKJ',
          ],
          dateFrom: moment('1995-12-25').toISOString(),
        })
        .expectBody([])
        .end(),
    ))

  it('should return empty if there are no tx after the given address', async () =>
    runInServer(api =>
      api
        .post(ENDPOINT)
        .send({
          addresses: [
            'DdzFFzCqrht37kjZfpjxNHScXnQoRVZMcsw3CrDXnfYCtcmHHfxYUzfn78KrvBDvibB4meDBMLpMdpkqtDMQahDHKECHostfqSSq7uD2',
          ],
          dateFrom: moment('2050-12-25').toISOString(),
        })
        .expectBody([])
        .end(),
    ))

  it('should return history for input and output addresses', async () => {
    const usedAddresses = [
      // Input and Output
      'DdzFFzCqrhseyiRj2yMRWzcTMVBywt6cpYjby2mJKCFqapoifhSif2TVMsXdGx5JfZ87hcVbuJ8JtSZ9nQ53s4Zm1kEM23Xp9BzPa1Be',
      // Output
      'DdzFFzCqrhsuwnRg1KY28gErSuA4UB2wBsiQwFmtetjdA8UKEmxGpEkAhtQ9EWRJMbMdvZ4mqXfCNEWwDFutskRmon1MVZ2eY4cGtBAP',
    ]

    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send({
          addresses: usedAddresses,
          dateFrom: moment('1995-12-25').toISOString(),
        })
        .expectBody(usedAndUnusedHistory)
        .end(),
    )
  })

  it('should history once even if addresses sent twice', async () => {
    const usedAddresses = [
      'DdzFFzCqrht6SJ6PHQnxzFkrqCVXxG2rfZLGgXyzV5e5LQyLy64TrGeWf3Gm3bRDzoDKJ3pmyj2SLdi4C6MVZqwmA9HsBmvDNP9XHYjc',
      'DdzFFzCqrht6SJ6PHQnxzFkrqCVXxG2rfZLGgXyzV5e5LQyLy64TrGeWf3Gm3bRDzoDKJ3pmyj2SLdi4C6MVZqwmA9HsBmvDNP9XHYjc',
    ]

    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send({
          addresses: usedAddresses,
          dateFrom: moment('1995-12-25').toISOString(),
        })
        .expectBody(expectedTxHistoryExample)
        .end(),
    )
  })

  it('should history once even if addresses is present in input and output', async () => {
    const usedAddresses = [
      'DdzFFzCqrhsh29QQ8S5xfjQeGaEiyz3AMdpeafE2cm5sFhYp54RqEErHmwHXUG2Kv2Ho7JKfvTfFHSEKxCmuPaTzRRiiEkTcZeketmeX',
    ]

    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send({
          addresses: usedAddresses,
          dateFrom: moment('1995-12-25').toISOString(),
        })
        .expect(
          assertOnResults((res, body) => {
            // https://explorer.iohkdev.io/address/CYhGP86nCaiEEEUSLWTS3gvAzmLTWM8Nj5CuJyqg5y2iJ1jNhwrZWsNE9n9xsmk5HFDa6DdZcPoXTUEYKddVsqJ1Y
            expect(body.length).to.equal(2)
          }),
        )
        .end(),
    )
  })

  it('should filter unused addresses', async () => {
    const usedAddresses = [
      'DdzFFzCqrht6SJ6PHQnxzFkrqCVXxG2rfZLGgXyzV5e5LQyLy64TrGeWf3Gm3bRDzoDKJ3pmyj2SLdi4C6MVZqwmA9HsBmvDNP9XHYjc',
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
        .send({ addresses, dateFrom: moment('1995-12-25').toISOString() })
        .expectBody(expectedTxHistoryExample)
        .end(),
    )
  })

  it('should paginate responses', async () => {
    const addresses = [
      'DdzFFzCqrhtCKmk5cs1Tagi8QWGsWy3xNZ31AsEUpSidYaofsX2KQBoHuK7ZoEFLdtH9Lb12Bhtou1AnYqRihdYBgKgtNwJ676bLpkJb',
      'DdzFFzCqrhsmuwTVdRNuUMoYS1bVYXRcTyzYso1kYzdj1pWAswugkFnkjAEXAVohkXXnBCJXwURwNc92iQN2JX942QS2CUWcfXsSDb9g',
    ]

    let lastDateFrom

    await runInServer(api =>
      api
        .post(ENDPOINT)
        .send({ addresses, dateFrom: moment('1995-12-25').toISOString() })
        .expect(
          assertOnResults((res, body) => {
            expect(body.length).to.equal(20)
            const lastElem = body[body.length - 1]
            expect(lastElem.hash).to.equal(
              'dbea47d320454987ff82c472c12b986588182ba6f5a7089a9c319d2a60dfb611',
            )
            lastDateFrom = lastElem.last_update
          }),
        )
        .end(),
    )

    return runInServer(api =>
      api
        .post(ENDPOINT)
        .send({
          addresses,
          // Paginate from previous response
          dateFrom: lastDateFrom,
        })
        .expect(
          assertOnResults((res, body) => {
            expect(body.length).to.equal(5)
            expect(body[0].hash).to.equal(
              'dbea47d320454987ff82c472c12b986588182ba6f5a7089a9c319d2a60dfb611',
            )
          }),
        )
        .end(),
    )
  })
})
