// @flow
import errors from 'restify-errors'

function responseGuard(req: any, res: any, next: any) {
  const {
    DATABASE_UNHEALTHY,
    DATABASE_UNHEALTHY_SINCE,
    DATABASE_UNHEALTHY_LIMIT,
  } = process.env
  const currentTimeStamp = new Date().getTime()

  if (
    (DATABASE_UNHEALTHY === 'true') &&
    ((currentTimeStamp - parseInt(DATABASE_UNHEALTHY_SINCE, 10)) > DATABASE_UNHEALTHY_LIMIT)
  ) {
    const error = new errors.InternalError(
      'The database is not synchronised with the blockchain.')
    return next(error)
  }
  return next()
}

export default responseGuard
