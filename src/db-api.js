// @flow

import type { Pool } from 'pg'
import type {
  DbApi,
  TypedResultSet,
  TxInput,
  TxOutput,
  UtxoLegacyDbResult,
  Tx,
  SingleTxInputDbResult,
  GetBlockDbResult,
  GetRawTxDbResult,
  GetTxDbResult,
  TransactionsHistoryDbResult,
  UtxoForAddressesDbResult,
  UsedAddressDbResult,
  UtxoSumDbResult,
} from 'icarus-backend'; // eslint-disable-line

// helper function to avoid destructuring ".rows" in the codebase
const extractRows = <T>(
  dbQuery: (...dbArgs: any) => Promise<TypedResultSet<T>>,
): (...args: any) => Promise<Array<T>> => async (...args) => {
    const dbResult = await dbQuery(...args)
    return dbResult.rows
  }


/**
 * Returns the list of addresses that were used at least once (as input or output)
 * @param {Db Object} db
 * @param {Array<Address>} addresses
 */
const filterUsedAddresses = (db: Pool) => async (
  addresses: Array<string>,
): Promise<TypedResultSet<UsedAddressDbResult>> =>
  (db.query({
    text: 'SELECT DISTINCT address FROM tx_out WHERE address = ANY($1)',
    values: [addresses],
    rowMode: 'array',
  }): any)

const utxoQuery = `SELECT 
  TRIM(LEADING '\\x' from tx.hash::text) AS "tx_hash", tx_out.index AS "tx_index",
  tx_out.address AS "receiver", tx_out.value AS "amount", tx.block::INTEGER as "block_num"
FROM tx
INNER JOIN tx_out ON tx.id = tx_out.tx_id
WHERE NOT EXISTS (SELECT true
  FROM tx_in
  WHERE (tx_out.tx_id = tx_in.tx_out_id) AND (tx_out.index = tx_in.tx_out_index)
) AND (tx_out.address = ANY($1))`

/**
 * Queries UTXO table looking for unspents for given addresses
 *
 * @param {Db Object} db
 * @param {Array<Address>} addresses
 */
const utxoForAddresses = (db: Pool) => async (addresses: Array<string>)
: Promise<TypedResultSet<UtxoForAddressesDbResult>> =>
  (db.query({
    text: utxoQuery,
    values: [addresses],
  }): any)

const utxoSumForAddresses = (db: Pool) => async (addresses: Array<string>)
: Promise<TypedResultSet<UtxoSumDbResult>> =>
  (db.query(`SELECT SUM(amount) FROM (${utxoQuery}) as utxo_table`, [addresses]): any)

const txHistoryQuery = (limit: number) => `
  SELECT txs.id as "dbId", txs.hash, txs.block_no, txs.blockHash, txs.block_index as tx_ordinal, txs.time, txs.body::text from (
      SELECT                                                                                                              
        tx.id, tx.hash::text, block.block_no, block.hash::text as blockHash, block.time, tx.block_index, tx_body.body::text                  
        FROM block                                                                                                        
        INNER JOIN tx ON block.id = tx.block                                                                              
        INNER JOIN tx_out ON tx.id = tx_out.tx_id
        JOIN  tx_body ON tx.hash = tx_body.hash                                                                  
        WHERE tx_out.address = ANY($1)                                                                                    
          AND block.time >= $2                                                                                  
    UNION                                                                                                                 
      SELECT DISTINCT                                                                                                     
        tx.id, tx.hash::text, block.block_no, block.hash::text as blockHash, block.time, tx.block_index, tx_body.body::text              
        FROM block                                                                                                        
        INNER JOIN tx ON block.id = tx.block                                                                              
        INNER JOIN tx_in ON tx.id = tx_in.tx_in_id                                                                        
        INNER JOIN tx_out ON (tx_in.tx_out_id = tx_out.tx_id) AND (tx_in.tx_out_index = tx_out.index)    
        JOIN  tx_body ON tx.hash = tx_body.hash                  
        WHERE tx_out.address = ANY($1)                                                                                                                                                                       
          AND block.time >= $2                                                                                      
    ORDER BY time ASC                                                                                                     
    LIMIT ${limit}                                                                                                              
  ) AS txs
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
): Promise<TypedResultSet<TransactionsHistoryDbResult>> =>
  (db.query(txHistoryQuery(limit), [addresses, dateFrom]): any)

// The remaining queries should be used only for the purposes of the legacy API!

/**
* Queries TX table looking for tx by its hash
* @param {Db Object} db
* @param {Transaction} tx
*/
const getTx = (db: Pool) => async (txHash: string)
: Promise<TypedResultSet<GetTxDbResult>> =>
  (db.query({
    text: 'SELECT id as "dbId", block as "blockId", hash::text FROM "tx" WHERE hash = $1',
    values: [txHash],
  }): any)

/**
* Queries TX_BODY table looking for tx body by its hash
* @param {Db Object} db
* @param {Transaction} tx
*/
const getRawTx = (db: Pool) => async (txHash: string)
: Promise<TypedResultSet<GetRawTxDbResult>> =>
  (db.query({
    text: 'SELECT body::text as tx_body FROM tx_body WHERE hash = $1',
    values: [txHash],
  }): any)

/**
* Queries BLOCK table looking for block with a given id
* @param {Db Object} db
* @param {Block} blockId
*/
const getBlockById = (db: Pool) => async (blockId: number)
: Promise<TypedResultSet<GetBlockDbResult>> =>
  (db.query({
    text: 'SELECT time, block_no, hash::text FROM block WHERE id = $1',
    values: [blockId],
  }): any)

/**
* Queries TX* tables to get txInputs for a given transaction
* @param {Db Object} db
* @param {Transaction} tx
*/
const getSingleTxInputs = (db: Pool) => async (txId: number)
: Promise<TypedResultSet<SingleTxInputDbResult>> =>
  (db.query({
    text: `SELECT
      tx_out.address, tx_out.value
      FROM tx_out
      INNER JOIN tx ON tx.id = tx_out.tx_id
      INNER JOIN tx_in ON tx_in.tx_out_id = tx_out.tx_id AND tx_in.tx_out_index = tx_out.index
      WHERE tx_in.tx_in_id = $1`,
    values: [txId],
  }): any)

/**
* Queries TX, BLOCK, TX_OUT tables to acquire inward and outward transactions for given addresses
* @param {Db Object} db
* @param {Array<Address>} addresses
*/
const getTransactions = (db: Pool) => async (addresses: Array<string>)
: Promise<TypedResultSet<Tx>> =>
  (db.query({
    text: `SELECT DISTINCT
      tx.id as "dbId", tx.hash::text, block.time
      FROM block 
      INNER JOIN tx ON block.id = tx.block 
      INNER JOIN tx_out ON tx.id = tx_out.tx_id
      WHERE tx_out.address = ANY($1)
    UNION
    SELECT DISTINCT 
      tx.id as "dbId", tx.hash::text, block.time
      FROM block 
      INNER JOIN tx ON block.id = tx.block 
      INNER JOIN tx_in ON tx.id = tx_in.tx_in_id 
      INNER JOIN tx_out ON (tx_in.tx_out_id = tx_out.tx_id) AND (tx_in.tx_out_index = tx_out.index)
      WHERE tx_out.address = ANY($1)`,
    values: [addresses],
  }): any)

/**
* Queries TX* tables to acquire bulk tx inputs for given transactions
* @param {Db Object} db
* @param {Array<Transaction>} txIds
*/
const getTxsInputs = (db: Pool) => async (txIds: Array<number>)
: Promise<TypedResultSet<TxInput>> =>
  (db.query({
    text: `SELECT DISTINCT
      tx.id as "txDbId", tx_out.address, tx_out.value, tx2.hash::text, tx_out.index, (tx2.size = 0) as "isGenesis"
      FROM tx
      INNER JOIN tx_in ON tx.id = tx_in.tx_in_id 
      INNER JOIN tx_out ON (tx_in.tx_out_id = tx_out.tx_id) AND (tx_in.tx_out_index = tx_out.index) 
      INNER JOIN tx AS tx2 ON tx2.id = tx_in.tx_out_id
      WHERE tx_in.tx_in_id = ANY($1)`,
    values: [txIds],
  }): any)

/**
* Queries TX* tables to acquire bulk tx outputs for given transactions
* @param {Db Object} db
* @param {Array<Transaction>} txIds
*/
const getTxsOutputs = (db: Pool) => async (txIds: Array<number>)
: Promise<TypedResultSet<TxOutput>> =>
  (db.query({
    text: `SELECT
      tx.id as "txDbId", tx_out.address, tx_out.value, tx_out.index
      FROM tx 
      INNER JOIN tx_out ON tx.id = tx_out.tx_id
      WHERE tx.id = ANY($1)`,
    values: [txIds],
  }): any)

/**
 * Queries UTXO table looking for unspents for given addresses and renames the columns
 * @param {Db Object} db
 * @param {Array<Address>} addresses
 */
const utxoLegacy = (db: Pool) => async (addresses: Array<string>)
: Promise<TypedResultSet<UtxoLegacyDbResult>> =>
  (db.query({
    text: `SELECT 
      'CUtxo' AS "tag", tx.hash::text AS "cuId", tx_out.index AS "cuOutIndex", tx_out.address AS "cuAddress", tx_out.value AS "cuCoins"
      FROM tx
      INNER JOIN tx_out ON tx.id = tx_out.tx_id
      WHERE NOT EXISTS (SELECT true
        FROM tx_in
        WHERE (tx_out.tx_id = tx_in.tx_out_id) AND (tx_out.index = tx_in.tx_out_index)
      ) AND (tx_out.address = ANY($1))`,
    values: [addresses],
  }): any)

const bestBlock = (db: Pool) => async (): Promise<number> => {
  const query = await db.query('SELECT block_no FROM block WHERE block_no IS NOT NULL ORDER BY block_no DESC LIMIT 1')
  return query.rows.length > 0 ? parseInt(query.rows[0].block_no, 10) : 0
}

const stakePoolsQuery = (poolDbId?: number) => `
  SELECT      
  DISTINCT ON (ph.hash) RIGHT(ph.hash::text, -2) as pool_hash, p.registered_tx_id, p.pledge, p.reward_addr_id,
    p.margin, p.fixed_cost, pmd.url, RIGHT(po.hash::text, -2) as owner_hash
  FROM pool_update AS p
  LEFT JOIN pool_meta_data AS pmd ON p.meta=pmd.id
  LEFT JOIN pool_hash AS ph ON p.hash_id=ph.id
  LEFT JOIN pool_owner AS po ON po.pool_id=ph.id
  ${poolDbId ? `WHERE p.id=${poolDbId}` : ''}
  ORDER BY ph.hash, p.registered_tx_id DESC
` // TODO:also not retired?

/**
 * Gets all valid pools and their information
 * @param {Db Object} db
 */
const stakePoolsInfo = (db: Pool) => async ()
: Promise<TypedResultSet<any>> =>// TODO: type after it's clear what we need
  (db.query({
    text: stakePoolsQuery(),
  }): any)

/**
 * Gets information for a single stake pool specified by its hash
 * @param {Db Object} db
 * @param {number} poolDbId
 */
const singleStakePoolInfo = (db: Pool) => async (poolDbId: number)
: Promise<TypedResultSet<any>> =>// TODO: type after it's clear what we need
  (db.query({
    text: stakePoolsQuery(poolDbId),
  }): any)

/**
 * Gets id of pool that the given account delegates to
 * @param {Db Object} db
 */
const poolDelegatedTo = (db: Pool) => async (account: string)
: Promise<TypedResultSet<any>> =>// TODO: type after it's clear what we need
  (db.query({
    text: `SELECT
      d.update_id as pool_id from delegation as d
      LEFT JOIN stake_address as sa ON sa.id=d.addr_id
      WHERE sa.hash=$1`,
    values: [account],
  }): any)

export default (db: Pool): DbApi => ({
  filterUsedAddresses: extractRows(filterUsedAddresses(db)),
  utxoForAddresses: extractRows(utxoForAddresses(db)),
  utxoSumForAddresses: extractRows(utxoSumForAddresses(db)),
  transactionsHistoryForAddresses: extractRows(transactionsHistoryForAddresses(db)),
  bestBlock: bestBlock(db),
  // legacy cardano-db-sync schema
  utxoLegacy: extractRows(utxoLegacy(db)),
  getTx: extractRows(getTx(db)),
  getRawTx: extractRows(getRawTx(db)),
  getBlockById: extractRows(getBlockById(db)),
  getSingleTxInputs: extractRows(getSingleTxInputs(db)),
  getTransactions: extractRows(getTransactions(db)),
  getTxsInputs: extractRows(getTxsInputs(db)),
  getTxsOutputs: extractRows(getTxsOutputs(db)),
  stakePoolsInfo: extractRows(stakePoolsInfo(db)),
  singleStakePoolInfo: extractRows(singleStakePoolInfo(db)),
  poolDelegatedTo: extractRows(poolDelegatedTo(db)),
})
