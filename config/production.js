const { raw } = require('config/raw')
const { consoleLogger } = require('../src/logger')

module.exports = {
  appName: 'icarus-poc-backend-service',
  server: {
    allowCredentials: true,
    logger: raw(consoleLogger('error')),
    port: 8080,
    apiConfig: {
      addressesRequestLimit: 50,
      txHistoryResponseLimit: 20,
    },
    importerSendTxEndpoint: 'http://icarus-importer:8200/api/txs/signed',
  },
}
