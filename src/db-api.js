// @flow

import type { Pool, ResultSet } from 'pg'
import type { DbApi } from 'icarus-backend'; // eslint-disable-line

/**
 * Returns the list of addresses that were used at least once (as input or output)
 * @param {Db Object} db
 * @param {Array<Address>} addresses
 */
const filterUsedAddresses = (db: Pool) => async (
  addresses: Array<string>,
): Promise<ResultSet> =>
  db.query({
    text: 'SELECT DISTINCT address FROM "tx_addresses" WHERE address = ANY($1)',
    values: [addresses],
    rowMode: 'array',
  })

const unspentAddresses = (db: Pool) => async (): Promise<ResultSet> =>
  db.query({
    text: 'SELECT DISTINCT utxos.receiver FROM utxos',
    rowMode: 'array',
  })

/**
 * Queries UTXO table looking for unspents for given addresses
 *
 * @param {Db Object} db
 * @param {Array<Address>} addresses
 */
const utxoForAddresses = (db: Pool) => async (addresses: Array<string>) =>
  db.query('SELECT * FROM "utxos" WHERE receiver = ANY($1)', [addresses])

const utxoSumForAddresses = (db: Pool) => async (addresses: Array<string>) =>
  db.query('SELECT SUM(amount) FROM "utxos" WHERE receiver = ANY($1)', [
    addresses,
  ])

// Cached queries
const txHistoryQuery = (limit: number) => `
  SELECT *
  FROM "txs"
  LEFT JOIN (SELECT * from "bestblock" LIMIT 1) f ON true
  WHERE 
    hash = ANY (
      SELECT tx_hash 
      FROM "tx_addresses"
      where address = ANY ($1)
    )
    AND last_update >= $2
  ORDER BY last_update ASC
  LIMIT ${limit}
`

/**
 * Queries DB looking for transactions including (either inputs or outputs)
 * for the given addresses
 *
 * @param {Db Object} db
 * @param {Array<Address>} addresses
 */
const transactionsHistoryForAddresses = (db: Pool) => async (
  limit: number,
  addresses: Array<string>,
  dateFrom: Date,
): Promise<ResultSet> => db.query(txHistoryQuery(limit), [addresses, dateFrom])

// The remaining queries should be used only for the purposes of the legacy API!

/**
 * Queries DB looking for successful transactions associated with any of the given addresses.
 * @param {Db Object} db
 * @param {Array<Address>} addresses
 */
const bulkAddressSummary = (db: Pool) => async (addresses: Array<string>): Promise<ResultSet> =>
  db.query({
    text: `SELECT * FROM "txs"
      WHERE hash = ANY (SELECT tx_hash FROM "tx_addresses" WHERE address = ANY($1))
      AND tx_state = $2
      ORDER BY time DESC`,
    values: [addresses, 'Successful'],
  })

/**
* Queries TXS table looking for a successful transaction with a given hash
* @param {Db Object} db
* @param {*} tx
*/
const txSummary = (db: Pool) => async (tx: string): Promise<ResultSet> =>
  db.query({
    text: 'SELECT * FROM "txs" WHERE hash = $1 AND tx_state = $2',
    values: [tx, 'Successful'],
  })

/**
 * Queries UTXO table looking for unspents for given addresses and renames the columns
 * @param {Db Object} db
 * @param {Array<Address>} addresses
 */
const utxoLegacy = (db: Pool) => async (addresses: Array<string>): Promise<ResultSet> =>
  db.query({
    text: `SELECT 'CUtxo' AS "tag", tx_hash AS "cuId", tx_index AS "cuOutIndex", receiver AS "cuAddress", amount AS "cuCoins"
      FROM "utxos"
      WHERE receiver = ANY($1)`,
    values: [addresses],
  })

  /**
* Queries TXS table for the last 20 transactions
* @param {Db Object} db
*/
const lastTxs = (db: Pool) => async (): Promise<ResultSet> =>
  db.query({
    text: `SELECT * FROM "txs"
      ORDER BY "time" DESC
      LIMIT 20`,
  })

const bestBlock = (db: Pool) => async (): Promise<number> => {
  const query = await db.query('SELECT * FROM "bestblock"')
  if (query.rows.length === 0) {
    return 0
  }

  return parseInt(query.rows[0].best_block_num, 10)
}

const bestSlotNum = (db: Pool) => async (): Promise<number> => {
  const query = await db.query(
    'SELECT epoch, slot FROM blocks ORDER BY block_height DESC limit 1',
  )
  if (query.rows.length === 0) {
    return 0
  }

  const epoch = parseInt(query.rows[0].epoch, 10)
  const slot = parseInt(query.rows[0].slot, 10)

  return (epoch * 21600) + slot
}

export default (db: Pool): DbApi => ({
  filterUsedAddresses: filterUsedAddresses(db),
  unspentAddresses: unspentAddresses(db),
  utxoForAddresses: utxoForAddresses(db),
  utxoSumForAddresses: utxoSumForAddresses(db),
  transactionsHistoryForAddresses: transactionsHistoryForAddresses(db),
  bestBlock: bestBlock(db),
  bestSlotNum: bestSlotNum(db),
  // legacy
  bulkAddressSummary: bulkAddressSummary(db),
  txSummary: txSummary(db),
  utxoLegacy: utxoLegacy(db),
  lastTxs: lastTxs(db),
})
