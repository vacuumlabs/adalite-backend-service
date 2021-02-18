import type { Logger } from 'bunyan'
import type { AxiosPromise } from 'axios'

declare module 'icarus-backend' {
  declare type ServerConfig = {
    logger: Logger,
    apiConfig: ApiConfig
  };

  declare type ApiConfig = {
    addressesRequestLimit: number,
    txHistoryResponseLimit: number,
  };

  declare type Request = {
    body: {
      addresses: Array<string>,
    },
  };

  declare type Response = {
    send: Function,
  };

  declare type TxHistoryRequest = {
    body: {
      addresses: Array<string>,
      dateFrom: Date,
    },
  };

  declare type SignedTxRequest = {
    body: SignedTx
  };

  declare type SignedTx = {
    signedTx: string,
  };

  declare type TypedResultSet<T> = {
    command: string,
    rowCount: number,
    oid: number,
    rows: Array<T>,
  };

  declare type DbApi = {
    filterUsedAddresses: (addresses: Array<string>) => Promise<Array<UsedAddressDbResult>>,
    utxoForAddresses: (addresses: Array<string>) => Promise<Array<UtxoForAddressesDbResult>>,
    utxoSumForAddresses: (addresses: Array<string>) => Promise<Array<UtxoSumDbResult>>,
    transactionsHistoryForAddresses: (
      limit: number,
      addresses: Array<string>,
      dateFrom: Date,
    ) => Promise<Array<TransactionsHistoryDbResult>>,
    bestBlock: () => Promise<number>,
    bestSlot: () => Promise<number>,
    getSingleTxInputs: (txId: number) => Promise<Array<SingleTxInputDbResult>>,
    getTransactions: (addresses: Array<string>) => Promise<Array<Tx>>,
    getTxsInputs: (txIds: Array<number>) => Promise<Array<TxInput>>,
    getTxsOutputs: (txIds: Array<number>) => Promise<Array<TxOutput>>,
    utxoLegacy: (addresses: Array<string>) => Promise<Array<UtxoLegacyDbResult>>,
    stakeAddressId: (account: string) => Promise<Array<StakeAddressIdDbResult>>,
    stakePoolsInfo: () => Promise<Array<StakePool>>,
    singleStakePoolInfo: (poolDbId: number) => Promise<Array<StakePool>>,
    poolDelegatedTo: (accountDbId: number) => Promise<Array<PoolDelegatedToDbResult>>,
    hasActiveStakingKey: (accountDbId: number) => Promise<boolean>,
    rewardsForAccountDbId: (accountDbId: number) => Promise<string>,
    epochDelegations: (accountDbId: number) => Promise<Array<EpochDelegationsDbResult>>,
    currentEpoch: () => Promise<number>,
    delegationHistory: (accountDbId: number) => Promise<Array<DelegationHistoryDbResult>>,
    withdrawalHistory: (accountDbId: number) => Promise<Array<WithdrawalHistoryDbResult>>,
    mainnetRewardHistory: (accountDbId: number) => Promise<Array<RewardHistoryDbResult>>,
    itnReward: (accountDbId: number) => Promise<RewardHistoryDbResult | null>,
    treasuryRewards: (accountDbId: number) => Promise<Array<RewardHistoryDbResult> | null>,
    stakeRegistrationHistory: (accountDbId: number) =>
      Promise<Array<StakeRegistrationHistoryDbResult>>,
  };

  declare type ImporterApi = {
    sendTx: (tx: Buffer) => AxiosPromise<ImporterResponse>
  };

  declare type ImporterResponse = {
    status: number,
    data: any
  }

  declare type TxInput = {
    txDbId: number,
    address: string,
    value: number,
    hash: string,
    index: number,
    isGenesis?: boolean,
  }

 declare type TxOutput = {
    txDbId: number,
    address: string,
    value: number,
    index: number,
  }

  declare type UsedAddressDbResult = [string]
  declare type UtxoSumDbResult = [number]

  declare type TransactionsHistoryDbResult = {
    dbId: number,
    hash: string,
    block_no: number,
    blockhash: string,
    tx_ordinal: number,
    time: Date,
    body: string,
  }

  declare type TxHistoryInputEntry = {
    address: string,
    amount: number,
    id: string,
    index: number,
    txHash: string,
  }

  declare type TxHistoryEntry = {
    hash: string,
    inputs_address: Array<string>,
    inputs_amount: Array<number>,
    outputs_address: Array<string>,
    outputs_amount: Array<number>,
    block_num: string,
    block_hash: string,
    time: Date,
    tx_state: string,
    last_update: Date,
    tx_ordinal: number,
    inputs: Array<TxHistoryInputEntry>,
    best_block_num: string,
  }

  declare type GetTxDbResult = {
    dbId: number,
    blockId: number,
    hash: string,
  }

  declare type GetRawTxDbResult = {
    tx_body: string,
  }

  declare type GetBlockDbResult = {
    time: Date,
    block_no: number,
    hash: string,
  }

  declare type UtxoLegacyDbResult = {
    tag: string,
    cuId: string,
    cuOutIndex: number,
    cuAddress: string,
    cuCoins: number,
  }

  declare type UtxoForAddressesDbResult = {
    tx_hash: string,
    tx_index: number,
    receiver: string,
    amount: number,
    block_num: number,
  }

  declare type SingleTxInputDbResult = {
    address: string,
    value: number,
  }

  declare type TxInputOutputEntry = [string, CoinObject]

  declare type CoinObject = {
    getCoin: string
  }

  declare type Tx = {
    dbId: number,
    hash: string,
    time: Date,
    fee: number,
  }

  declare type TxEntry = {
    ctbId: string,
    ctbTimeIssued: moment,
    ctbInputs: Array<TxInputOutputEntry>,
    ctbOutputs: Array<TxInputOutputEntry>,
    ctbInputSum: CoinObject,
    ctbOutputSum: CoinObject,
    fee: number,
  }

  declare type StakePool = {
    poolHash: string,
    pledge: number,
    margin: number,
    fixedCost: number,
    url: string,
  }

  declare type PoolDelegatedToDbResult = {
    poolHashDbId: number,
    retiringEpoch: number,
  }

  declare type StakeAddressIdDbResult = {
    accountDbId: number,
  }

  declare type EpochDelegationsDbResult = {
    epochNo: number,
    poolHashDbId: number,
  }

  declare type DelegationHistoryDbResult = {
    epochNo: number,
    time: Date,
    poolHash: string,
    txHash: string,
  }

  declare type WithdrawalHistoryDbResult = {
    epochNo: number,
    time: Date,
    amount: string,
    txHash: string,
  }

  declare type RewardType = 'ITN' | 'REGULAR' | 'TREASURY'
  declare type RewardHistoryDbResult = {
    forDelegationInEpoch: number,
    epochNo: number,
    time: Date,
    amount: string,
    poolHash: string,
    rewardType: RewardType,
  }

  declare type StakeRegistrationHistoryDbResult = {
    epochNo: number,
    time: Date,
    action: string,
    txHash: string,
  }
}
