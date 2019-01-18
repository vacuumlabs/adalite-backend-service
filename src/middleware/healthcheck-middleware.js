// @flow
import errors from 'restify-errors'

function checkDatabase(req: any, res: any, next: any) {
  if (process.env.BLOCK_RESPONSE !== 'true') {
    const error = new errors.InternalError(
      'The database is not synchronised with the blockchain.')
    return next(error)
  }
  return next()
}

export default checkDatabase
