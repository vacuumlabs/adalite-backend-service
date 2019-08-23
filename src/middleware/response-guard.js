// @flow
import errors from 'restify-errors'
import config from '../config'
import { getInstanceHealthStatus } from '../healthcheck'

const {
  disableHealthcheck,
} = config.get('server')

function shouldBlockRequest(req: any): boolean {
  if (disableHealthcheck) {
    return false
  }

  const currentHealthStatus = getInstanceHealthStatus()

  if (req.url === '/api/v2/healthcheck') {
    return !currentHealthStatus.healthy
  } else if (['/api/v2/bestBlock', '/api/v2/healthStatus', '/api/txs/last'].includes(req.url)) {
    // these requests are good to inspect the instance when it becomes unhealthy
    return false
  }

  // we give a grace period of 50s to the remaining requests so load balancer has time
  // to disable the instance without downtime
  const currentTime = Math.floor((new Date().getTime()) / 1000)

  if (currentHealthStatus.healthy) {
    return false
  }

  return currentTime - (currentHealthStatus.unhealthyFrom || 0) >= 50
}

function responseGuard(req: any, res: any, next: any) {
  if (shouldBlockRequest(req)) {
    return next(new errors.InternalError(
      'The instance is unhealthy',
    ))
  }

  return next()
}

export default responseGuard
