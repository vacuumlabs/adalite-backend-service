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
* TODO
* @param {Db Object} db
* @param {*} tx
*/
const getTx = (db: Pool) => async (tx: string): Promise<ResultSet> =>
  db.query({
    text: 'SELECT * FROM "tx" WHERE hash = $1',
    values: [tx],
  })

/**
* TODO
* @param {Db Object} db
* @param {*} tx
*/
const getTxOutputs = (db: Pool) => async (tx: string): Promise<ResultSet> =>
  db.query({
    text: `SELECT 
      tx_out.address, tx_out.value, tx.hash, tx_out.index
      FROM tx
      INNER JOIN tx_out ON tx.id = tx_out.tx_id
      WHERE tx_out.tx_id = $1`,
    values: [tx],
  })

/**
* TODO
* @param {Db Object} db
* @param {*} blockId
*/
const getBlockById = (db: Pool) => async (blockId: string): Promise<ResultSet> =>
  db.query({
    text: 'SELECT * FROM block WHERE id = $1',
    values: [blockId],
  })

/**
* TODO
* @param {Db Object} db
* @param {*} tx
*/
const getTxInputs = (db: Pool) => async (tx: string): Promise<ResultSet> =>
  db.query({
    text: `SELECT
      tx_out.address, tx_out.value, tx.hash, tx_out.index
      FROM tx_out
      INNER JOIN tx ON tx.id = tx_out.tx_id
      INNER JOIN tx_in ON tx_in.tx_out_id = tx_out.tx_id AND tx_in.tx_out_index = tx_out.index
      WHERE tx_in.tx_in_id = $1`,
    values: [tx],
  })

/**
* TODO
* @param {Db Object} db
* @param {*} address
*/
const getInwardTransactions = (db: Pool) => async (address: string): Promise<ResultSet> =>
  db.query({
    text: `SELECT
      tx.id, tx.hash::text, block.time
      FROM block 
      INNER JOIN tx ON block.id = tx.block 
      INNER JOIN tx_out ON tx.id = tx_out.tx_id
      WHERE tx_out.address = $1`,
    values: [address],
  })

/**
* TODO
* @param {Db Object} db
* @param {*} address
*/
const getOutwardTransactions = (db: Pool) => async (address: string): Promise<ResultSet> =>
  db.query({
    text: `SELECT DISTINCT 
      tx.id, tx.hash::text, block.time
      FROM block 
      INNER JOIN tx ON block.id = tx.block 
      INNER JOIN tx_in ON tx.id = tx_in.tx_in_id 
      INNER JOIN tx_out ON (tx_in.tx_out_id = tx_out.tx_id) AND (tx_in.tx_out_index = tx_out.index)
      WHERE tx_out.address = $1`,
    values: [address],
  })

// CASE WHEN tx.size=0 THEN TRUE ELSE FALSE END
//         as isGenesisTx

/**
* TODO
* @param {Db Object} db
* @param {*} tx
*/
const getDistinctTxInputs = (db: Pool) => async (txs: Array<string>): Promise<ResultSet> =>
  db.query({
    text: `SELECT
      tx.id as txId, tx_out.address, tx_out.value
      FROM tx
      INNER JOIN tx_in ON tx.id = tx_in.tx_in_id 
      INNER JOIN tx_out ON (tx_in.tx_out_id = tx_out.tx_id) AND (tx_in.tx_out_index = tx_out.index) 
      INNER JOIN tx AS tx2 ON tx2.id = tx_in.tx_out_id
      WHERE tx_in.tx_in_id = ANY($1)`,
    values: [txs],
  })

/**
* TODO
* @param {Db Object} db
* @param {*} tx
*/
const getDistinctTxOutputs = (db: Pool) => async (txs: Array<string>): Promise<ResultSet> =>
  db.query({
    text: `SELECT
      tx.id as txId, tx_out.address, tx_out.value
      FROM tx 
      INNER JOIN tx_out ON tx.id = tx_out.tx_id
      WHERE tx.id = ANY($1)`,
    values: [txs],
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

const bestBlock = (db: Pool) => async (): Promise<number> => {
  const query = await db.query('SELECT block_no FROM block WHERE block_no IS NOT NULL ORDER BY block_no DESC LIMIT 1')
  return query.rows.length > 0 ? parseInt(query.rows[0].block_no, 10) : 0
}

export default (db: Pool): DbApi => ({
  filterUsedAddresses: filterUsedAddresses(db),
  unspentAddresses: unspentAddresses(db),
  utxoForAddresses: utxoForAddresses(db),
  utxoSumForAddresses: utxoSumForAddresses(db),
  transactionsHistoryForAddresses: transactionsHistoryForAddresses(db),
  bestBlock: bestBlock(db),
  // legacy
  bulkAddressSummary: bulkAddressSummary(db),
  txSummary: txSummary(db),
  utxoLegacy: utxoLegacy(db),
  // cardano-db-sync schema
  getTx: getTx(db),
  getTxOutputs: getTxOutputs(db),
  getBlockById: getBlockById(db),
  getTxInputs: getTxInputs(db),
  getInwardTransactions: getInwardTransactions(db),
  getOutwardTransactions: getOutwardTransactions(db),
  getDistinctTxInputs: getDistinctTxInputs(db),
  getDistinctTxOutputs: getDistinctTxOutputs(db),
})
