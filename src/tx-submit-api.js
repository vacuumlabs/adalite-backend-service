// @flow
import { post } from 'axios'

import type { ImporterApi } from 'icarus-backend'; // eslint-disable-line

export default (txSubmitApiUrl: string): ImporterApi => ({
  sendTx: (tx: string) => post(
    `${txSubmitApiUrl}/api/submit/tx`,
    tx,
    {
      headers: {
        'Content-Type': 'application/cbor',
      },
    },
  ),
})
