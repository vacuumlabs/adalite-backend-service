// @flow
import errors from 'restify-errors'

function responseGuard(req: any, res: any, next: any) {
  const { DATABASE_UNHEALTHY_SINCE } = process.env
  const currentTimeStamp = new Date().getTime()
  const unhealthyLimit = 10000

  if (
    !!DATABASE_UNHEALTHY_SINCE &&
    ((currentTimeStamp - parseInt(DATABASE_UNHEALTHY_SINCE, 10)) > unhealthyLimit)
  ) {
    const error = new errors.InternalError(
      'The database is not synchronised with the blockchain.')
    return next(error)
  }
  return next()
}

export default responseGuard
