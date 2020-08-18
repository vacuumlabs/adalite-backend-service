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
  StakePool,
  PoolDelegatedToDbResult,
  StakeAddressIdDbResult,
  EpochDelegationsDbResult,
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
  SELECT txs.id as "dbId", txs.hash, txs.block_no, txs.blockHash, txs.block_index as tx_ordinal, txs.time from (
      SELECT                                                                                                              
        tx.id, tx.hash::text, block.block_no, block.hash::text as blockHash, block.time, tx.block_index                
        FROM block                                                                                                        
        INNER JOIN tx ON block.id = tx.block                                                                              
        INNER JOIN tx_out ON tx.id = tx_out.tx_id                                                                
        WHERE tx_out.address = ANY($1)                                                                                    
          AND block.time >= $2                                                                                  
    UNION                                                                                                                 
      SELECT DISTINCT                                                                                                     
        tx.id, tx.hash::text, block.block_no, block.hash::text as blockHash, block.time, tx.block_index            
        FROM block                                                                                                        
        INNER JOIN tx ON block.id = tx.block                                                                              
        INNER JOIN tx_in ON tx.id = tx_in.tx_in_id                                                                        
        INNER JOIN tx_out ON (tx_in.tx_out_id = tx_out.tx_id) AND (tx_in.tx_out_index = tx_out.index)             
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

const bestSlot = (db: Pool) => async (): Promise<number> => {
  const query = await db.query('SELECT slot_no FROM block WHERE slot_no IS NOT NULL ORDER BY slot_no DESC LIMIT 1')
  return query.rows.length > 0 ? parseInt(query.rows[0].slot_no, 10) : 0
}

/**
 * Queries stake_address table for id of a stake_address for later fast lookups
 * @param {Db Object} db
 * @param {string} account
 */
const stakeAddressId = (db: Pool) => async (account: string)
: Promise<TypedResultSet<StakeAddressIdDbResult>> =>
  (db.query({
    text: 'SELECT id as "accountDbId" from stake_address WHERE hash=$1',
    values: [account],
  }): any)

const retiredPoolsIdsQuery = `SELECT update_id FROM pool_retire pr
  WHERE retiring_epoch < (SELECT no FROM epoch ORDER BY no DESC limit 1)`

/**
 * Gets information about a specified pool if id of this pool hash is specified,
 *  otherwise all pools are retrieved
 * @param {number=} poolHashDbId - database id of a given pool hash
 */
const stakePoolsQuery = (poolHashDbId?: number) => `SELECT 
  sp."poolHash", sp.pledge, sp.margin, sp."fixedCost", sp.url FROM
    (SELECT 
      DISTINCT ON (ph.hash) RIGHT(ph.hash::text, -2) as "poolHash", p.pledge, p.margin,
        p.fixed_cost as "fixedCost", pmd.url, p.id as update_id
      FROM pool_update AS p
      LEFT JOIN pool_meta_data AS pmd ON p.meta=pmd.id
      LEFT JOIN pool_hash AS ph ON p.hash_id=ph.id
      LEFT JOIN pool_owner AS po ON po.pool_id=ph.id
      ${poolHashDbId ? `WHERE ph.id=${poolHashDbId}` : ''}
      ORDER BY ph.hash, p.registered_tx_id DESC
    ) sp
  WHERE sp.update_id NOT IN (${retiredPoolsIdsQuery})
`

/**
 * Gets all valid pools and their information
 * @param {Db Object} db
 */
const stakePoolsInfo = (db: Pool) => async ()
: Promise<TypedResultSet<StakePool>> => (
    db.query(stakePoolsQuery()): any)

/**
 * Gets information for a single stake pool specified by its hash
 * @param {Db Object} db
 * @param {number} poolDbId
 */
const singleStakePoolInfo = (db: Pool) => async (poolDbId: number)
: Promise<TypedResultSet<StakePool>> =>
  (db.query(stakePoolsQuery(poolDbId)): any)

/**
 * Gets id of pool that the given account delegates to
 * @param {Db Object} db
 * @param {number} accountDbId
 */
const poolDelegatedTo = (db: Pool) => async (accountDbId: number)
: Promise<TypedResultSet<PoolDelegatedToDbResult>> =>
  (db.query({
    text: `SELECT
      p.hash_id AS "poolHashDbId" FROM pool_update AS p
      LEFT JOIN delegation AS d ON d.update_id=p.id
      LEFT JOIN tx ON d.tx_id=tx.id      
      WHERE d.addr_id=$1
      ORDER BY tx.block DESC
      LIMIT 1`, // TODO: take deregistration into account when it's implemented
    values: [accountDbId],
  }): any)

/**
 * Gets latest block of registration or deregistration for a given "addr_id"
 * @param {string} dbTable - "stake_registration" or "stake_deregistration" table
 */
const newestStakingKeyBlockForDb = (dbTable: string) => `SELECT
  tx.block from tx
  LEFT JOIN ${dbTable} ON tx.id=${dbTable}.tx_id
  WHERE ${dbTable}.addr_id=$1
  ORDER BY tx.block DESC
  LIMIT 1
`

const hasActiveStakingKey = (db: Pool) => async (accountDbId: number): Promise<boolean> => {
  const registrationBlockResult = await db.query({
    text: newestStakingKeyBlockForDb('stake_registration'),
    values: [accountDbId],
  })
  const deregistrationBlockResult = await db.query({
    text: newestStakingKeyBlockForDb('stake_deregistration'),
    values: [accountDbId],
  })
  const latestRegistrationBlock = registrationBlockResult.rows.length
    ? parseInt(registrationBlockResult.rows[0].block, 10) : -1
  const latestDeregistrationBlock = deregistrationBlockResult.rows.length
    ? parseInt(deregistrationBlockResult.rows[0].block, 10) : -1
  return latestRegistrationBlock > latestDeregistrationBlock
}

const rewardsForAccountDbId = (db: Pool) => async (accountDbId: number): Promise<number> => {
  const rewardResult = await db.query(`
    SELECT COALESCE(sum(amount), 0) as amount from (
      SELECT amount FROM reward WHERE addr_id=${accountDbId}
      UNION
      SELECT r.amount FROM reserve r WHERE addr_id=${accountDbId}
      AND NOT EXISTS (SELECT FROM withdrawal w WHERE w.addr_id=r.addr_id and w.amount=r.amount)
    ) as rewards`)
  return rewardResult.rows.length > 0 ? parseInt(rewardResult.rows[0].amount, 10) : 0
}

/**
 * Gets delegations for the last 4 (TODO: change to 3 later) epochs
 * @param {Db Object} db
 * @param {number} accountDbId
 */
const epochDelegations = (db: Pool) => async (accountDbId: number)
: Promise<TypedResultSet<EpochDelegationsDbResult>> =>
  (db.query({
    text: `SELECT DISTINCT ON (block.epoch_no) block.epoch_no as "epochNo", pu.hash_id as "poolHashDbId"
      FROM delegation d
      LEFT JOIN tx ON tx.id=d.tx_id
      LEFT JOIN block ON tx.block=block.id
      LEFT JOIN pool_update pu on d.update_id=pu.id
      WHERE d.addr_id=$1 AND block.epoch_no >=
        (SELECT no FROM epoch ORDER BY no desc limit 1) - 4
      ORDER BY block.epoch_no ASC, block.slot_no DESC`,
    values: [accountDbId],
  }): any)

export default (db: Pool): DbApi => ({
  filterUsedAddresses: extractRows(filterUsedAddresses(db)),
  utxoForAddresses: extractRows(utxoForAddresses(db)),
  utxoSumForAddresses: extractRows(utxoSumForAddresses(db)),
  transactionsHistoryForAddresses: extractRows(transactionsHistoryForAddresses(db)),
  bestBlock: bestBlock(db),
  bestSlot: bestSlot(db),
  // legacy cardano-db-sync schema
  utxoLegacy: extractRows(utxoLegacy(db)),
  getTx: extractRows(getTx(db)),
  getRawTx: extractRows(getRawTx(db)),
  getBlockById: extractRows(getBlockById(db)),
  getSingleTxInputs: extractRows(getSingleTxInputs(db)),
  getTransactions: extractRows(getTransactions(db)),
  getTxsInputs: extractRows(getTxsInputs(db)),
  getTxsOutputs: extractRows(getTxsOutputs(db)),
  stakeAddressId: extractRows(stakeAddressId(db)),
  stakePoolsInfo: extractRows(stakePoolsInfo(db)),
  singleStakePoolInfo: extractRows(singleStakePoolInfo(db)),
  poolDelegatedTo: extractRows(poolDelegatedTo(db)),
  hasActiveStakingKey: hasActiveStakingKey(db),
  rewardsForAccountDbId: rewardsForAccountDbId(db),
  epochDelegations: extractRows(epochDelegations(db)),
})
