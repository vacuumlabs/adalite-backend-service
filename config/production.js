const { raw } = require('config/raw')
const { consoleLogger } = require('../src/logger')

module.exports = {
  appName: 'icarus-poc-backend-service',
  server: {
    allowCredentials: true,
    logger: raw(consoleLogger('info')),
    port: 8080,
    apiConfig: {
      addressesRequestLimit: 50,
      txHistoryResponseLimit: 20,
    },
    importerSendTxEndpoint: 'http://localhost:8200/api/txs/signed',
  },
}
