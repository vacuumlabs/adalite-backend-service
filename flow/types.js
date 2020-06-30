import type { Logger } from 'bunyan'
import type { ResultSet } from 'pg'
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

  declare type DbApi = {
    filterUsedAddresses: (addresses: Array<string>) => Promise<ResultSet>,
    unspentAddresses: () => Promise<ResultSet>,
    utxoForAddresses: (addresses: Array<string>) => Promise<ResultSet>,
    utxoSumForAddresses: (addresses: Array<string>) => Promise<ResultSet>,
    transactionsHistoryForAddresses: (
      limit: number,
      addresses: Array<string>,
      dateFrom: Date,
      txHash: ?string,
    ) => Promise<ResultSet>,
    bestBlock: () => Promise<number>,
    getTxsInputs: (txIds: Array<number>) => Promise<Array<Row>>,
    getTxsOutputs: (txIds: Array<number>) => Promise<Array<Row>>,
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
  }

 declare type TxOutput = {
    txDbId: number,
    address: string,
    value: number,
    index: number,
  }

  declare type TxInputOutputEntry = [string, CoinObject]

  declare type CoinObject = {
    getCoin: string
  }

  declare type Tx = {
    dbId: number,
    hash: string,
    time: Date,
  }

  declare type TxEntry = {
    ctbId: string,
    ctbTimeIssued: moment,
    ctbInputs: Array<TxInputOutputEntry>,
    ctbOutputs: Array<TxInputOutputEntry>,
    ctbInputSum: CoinObject,
    ctbOutputSum: CoinObject,
  }
}
