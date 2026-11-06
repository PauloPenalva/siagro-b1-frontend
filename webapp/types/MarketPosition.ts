/** Contrato HTTP da parte 4 (Posição): `GET /market/position` e o SSE `/market/position/live`. */

export type MarketLimitState = "ok" | "longExceeded" | "shortExceeded" | "none";

export type MarketPositionBucket = {
  year: number;
  month: number;
  instrumentCode: string;
  purchaseTons: number;
  salesTons: number;
  futuresTons: number;
  netTons: number;
  coveredTons: number;
  hedgePercent: number;
  lastPrice: number;
  previousClose: number;
  futuresUnrealized: number;
  futuresUnrealizedAtClose: number;
  physicalExchangeMtm: number;
  physicalWithoutReference: number;
  currency: string;
  limitState: MarketLimitState;
  maxLong: number;
  maxShort: number;
};

export type MarketPositionCommodity = {
  code: string;
  name: string;
  buckets: MarketPositionBucket[];
  total: MarketPositionBucket;
};

export type MarketPositionUsdBucket = {
  year: number;
  month: number;
  receivableUsd: number;
  payableUsd: number;
  fxHedgeUsd: number;
  usdFuturesUsd: number;
  netUsd: number;
  coveredUsd: number;
  hedgePercent: number;
  fxHedgeUnrealizedBrl: number;
  limitState: MarketLimitState;
  maxLong: number;
  maxShort: number;
};

export type MarketPositionAlert = { limitId: number; description: string; value: number; limitValue: number; state: MarketLimitState };

export type MarketPositionIgnored = { side: string; contractKey: string; contractCode: string; itemCode: string; reason: string };

export type MarketPositionSnapshot = {
  generatedAt: string;
  connectionStatus: string;
  connectionMessage: string;
  commodities: MarketPositionCommodity[];
  usd: { buckets: MarketPositionUsdBucket[]; total: MarketPositionUsdBucket; spotFx: number; openCommodityValueUsd: number };
  results: { realizedUsd: number; realizedBrl: number; unrealizedUsd: number; unrealizedBrl: number };
  alerts: MarketPositionAlert[];
  ignored: MarketPositionIgnored[];
};

/** `GET /market/position/contracts`. */
export type MarketPositionContract = {
  side: string;
  contractKey: string;
  contractCode: string;
  cardName: string;
  itemCode: string;
  deliveryEndDate: string;
  firmOpenTons: number;
  pricePerBag: number;
  currency: string;
  marketInstrumentCode: string;
  marketExchangePrice: number;
  marketPremium: number;
  usdLinked: boolean;
  fxLocked: boolean;
};

/** `GET /market/position/usd-contracts`. */
export type MarketPositionUsdContract = {
  side: string;
  contractKey: string;
  contractCode: string;
  cardName: string;
  itemCode: string;
  cashFlowDate: string;
  firmOpenTons: number;
  usdAmount: number;
  usdPricePerBag: number;
  fxLocked: boolean;
  fxRate: number;
};

export type PositionFlashField = "lastPrice" | "futuresUnrealized" | "physicalExchangeMtm";

/** Linha da grade de commodities: um balde (ou o total) de uma commodity, achatado. */
export type MarketPositionRow = MarketPositionBucket & {
  rowKey: string;
  commodityCode: string;
  commodityName: string;
  isTotal: boolean;
  /** Balde "sem vencimento" (instrumento sem vencimento cadastrado): não tem contratos para abrir. */
  noMaturity: boolean;
  flash?: Record<PositionFlashField, string>;
  flashAt?: Record<PositionFlashField, number>;
};

export type MarketPositionUsdRow = MarketPositionUsdBucket & { rowKey: string; isTotal: boolean };

export type MarketPositionCard = {
  title: string;
  exposedText: string;
  exposedState: string;
  directionText: string;
  coveredText: string;
  hedgeVisible: boolean;
  hedgeValue: number;
  hedgeText: string;
  hedgeLabel: string;
  mtmText: string;
  limitText: string;
  limitState: string;
};
