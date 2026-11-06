export type MarketExchange = "Cbot" | "B3" | "Spot";
export type MarketInstrumentType = "Future" | "Spot" | "CurvePoint";
export type MarketQuoteUnit = "UsCentsPerBushel" | "BrlPerBag" | "BrlPerUsd" | "UsdPerTon";

/** Entidade OData `MarketInstruments` (chave `Code`). */
export type MarketInstrument = {
  Code?: string;
  CmaSourceId?: number;
  Description?: string;
  Exchange?: MarketExchange;
  Type?: MarketInstrumentType;
  Commodity?: string;
  ItemCode?: string;
  ExpirationDate?: string;
  QuoteUnit?: MarketQuoteUnit;
  ContractSize?: number;
  TonFactor?: number;
  CurveDays?: number;
  GroupName?: string;
  SortOrder?: number;
  Active?: boolean;
};
