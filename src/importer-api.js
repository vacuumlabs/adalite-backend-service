// @flow
import { post } from 'axios'

import type { ImporterApi } from 'icarus-backend'; // eslint-disable-line

export default (importerUrl: string): ImporterApi => ({
  sendTx: tx => post(`${importerUrl}/api/txs/signed`, tx),
})
