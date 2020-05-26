module.exports = {
  appName: 'icarus-poc-backend-service',
  server: {
    port: 8080,
    apiConfig: {
      addressesRequestLimit: 50,
      txHistoryResponseLimit: 20,
    },
    disableHealthcheck: false,
    allowCredentials: false,
  },
  cardanoHttpBridgeUrl: 'https://localhost:8300',
}
