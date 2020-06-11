exports.up = async (knex) => knex.schema.table('tx_out', (table) => {
  table.index('address', 'idx_tx_out_address', 'hash')
})

exports.down = async (knex) => knex.schema.table('tx_out', (table) => {
  table.dropIndex('address', 'idx_tx_out_address')
})
