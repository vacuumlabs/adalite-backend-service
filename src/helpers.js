import { _ } from 'lodash'
import type {
  TxInput,
  TxOutput,
} from 'icarus-backend'; // eslint-disable-line

/**
 * Database stores all hashes with prefix of '\x'. To hide inner database structure and
 * deal with just the results in common format, these functions wrap and unwrap the hashes.
*/
export const wrapHashPrefix = (hash: string): string => `\\x${hash}`
export const unwrapHashPrefix = (hash: string): string => hash.substr(2)
// retain original order of 'index' of inputs or outputs in a transaction
export const groupInputsOutputs = (
  txInputsOutputs: Array<TxInput> | Array<TxOutput>,
) => _(txInputsOutputs)
  .groupBy(tx => tx.txDbId)
  .each(group => group.sort((a, b) => a.index - b.index))
