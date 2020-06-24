// @flow
import { post } from 'axios'

import type { ImporterApi } from 'icarus-backend'; // eslint-disable-line

export default (importerSendTxEndpoint: string): ImporterApi => ({
  sendTx: tx => post(
    `${importerSendTxEndpoint}/api/submit/tx`,
    tx,
    {
      headers: {
        'Content-Type': 'application/cbor',
      },
    },
  ),
})
