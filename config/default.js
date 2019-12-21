module.exports = {
  appName: 'icarus-poc-backend-service',
  server: {
    port: 8080,
    apiConfig: {
      addressesRequestLimit: 50,
      historyResponseLimit: 20,
    },
    disableHealthcheck: false,
    allowCredentials: false,
  },
}
