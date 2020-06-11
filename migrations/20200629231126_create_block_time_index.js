exports.up = async (knex) => knex.schema.table('block', (table) => {
  table.index('time', 'idx_block_time', 'btree')
})

exports.down = async (knex) => knex.schema.table('block', (table) => {
  table.dropIndex('time', 'idx_block_time')
})
