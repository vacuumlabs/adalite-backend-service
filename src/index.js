import 'source-map-support/register'
import '@babel/polyfill'
import config from './config'
import server from './server'

const serverConfig = config.get('server')
const { logger } = serverConfig

server().catch((err) => {
  logger.error(err)
  process.exit(1)
})

