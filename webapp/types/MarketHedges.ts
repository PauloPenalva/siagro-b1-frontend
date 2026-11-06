/** Tipos das telas de hedge do módulo Mercado (corretoras, ajustes de margem, operações de bolsa). */

export type MarketCounterpartyType = "Broker" | "Bank";

/** Entidade OData `MarketCounterparties` (chave `Id`); contas pela navegação `Accounts`. */
export type MarketCounterparty = {
  Id?: number;
  Name?: string;
  Type?: MarketCounterpartyType;
  TaxId?: string;
  Active?: boolean;
  Accounts?: MarketCounterpartyAccount[];
};

/** Entidade OData `MarketCounterpartyAccounts` (chave `Id`). */
export type MarketCounterpartyAccount = {
  Id?: number;
  CounterpartyId?: number;
  Code?: string;
  Description?: string;
  Active?: boolean;
  Counterparty?: MarketCounterparty;
};

/** Entidade OData `MarketBrokerStatements` (chave `Id`); `Date` é `Edm.Date`. */
export type MarketBrokerStatement = {
  Id?: number;
  AccountId?: number;
  Date?: string;
  DailyAdjustment?: number | string;
  MarginRequired?: number | string;
  MarginDeposited?: number | string;
  Currency?: string;
  Notes?: string;
  CreatedBy?: string;
  CreatedAt?: string;
  Account?: MarketCounterpartyAccount;
};

/** Entidade OData `MarketFuturesTrades` (chave `Id`), só leitura; instrumento e conta pelo `$expand`. */
export type MarketFuturesTrade = {
  Id?: number;
  TradedAt?: string;
  TradeDate?: string;
  AccountId?: number;
  InstrumentCode?: string;
  Side?: string;
  Lots?: number;
  Price?: number | string;
  Fees?: number | string;
  FeesCurrency?: string;
  Reason?: string;
  BrokerReference?: string;
  OpenLots?: number;
  Confirmed?: boolean;
  PurchaseContractKey?: string;
  SalesContractKey?: string;
  ContractCode?: string;
  EfpId?: number;
  Notes?: string;
  Account?: MarketCounterpartyAccount;
  Instrument?: { Code?: string; Description?: string; QuoteUnit?: string; ContractSize?: number | string; TonFactor?: number | string };
};

/** Corpo do POST/PUT `/market/futures-trades` (enums em camelCase, data em UTC com `Z`). */
export type MarketFuturesTradePayload = {
  tradedAt: string;
  accountId: number;
  instrumentCode: string;
  side: string;
  lots: number;
  price: number;
  fees: number;
  feesCurrency: string;
  reason: string;
  brokerReference: string;
  purchaseContractKey: string;
  salesContractKey: string;
  notes: string;
};

/** Resposta de `GET /market/futures-trades/lot-info`. */
export type MarketLotInfo = {
  instrumentCode?: string;
  quoteUnit?: string;
  contractSize?: number;
  tonsPerLot?: number;
  usdPerLot?: number;
  currency?: string;
};

/** Linha de `GET /market/futures-positions` (`netLots`, `tons`, `usd`: + comprado, − vendido). */
export type MarketFuturesPosition = {
  accountId?: number;
  accountLabel?: string;
  instrumentCode?: string;
  instrumentDescription?: string;
  commodity?: string;
  expirationDate?: string;
  quoteUnit?: string;
  netLots?: number;
  avgPrice?: number;
  tons?: number;
  usd?: number;
  lastPrice?: number;
  unrealizedPnl?: number;
  currency?: string;
};

/** Linha de `GET /market/futures-realized`. */
export type MarketFuturesRealized = {
  matchId?: number;
  closeDate?: string;
  accountId?: number;
  accountLabel?: string;
  instrumentCode?: string;
  lots?: number;
  openPrice?: number;
  closePrice?: number;
  realizedPnl?: number;
  currency?: string;
};
