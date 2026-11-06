/** Tipos dos cadastros da parte 4 do Mercado (commodities e limites de exposição). */

export type MarketHedgeExchange = "Cbot" | "B3" | "Spot";

/** Entidade OData `MarketCommodities` (chave `Code`); produtos em `Items`, mapa de meses em `Months`. */
export type MarketCommodity = {
  Code?: string;
  Name?: string;
  HedgeExchange?: MarketHedgeExchange;
  Active?: boolean;
};

/** Entidade OData `MarketExposureLimits` (chave `Id`). `Year`/`Month` nulos = limite "Total". */
export type MarketExposureLimit = {
  Id?: number;
  Scope?: "Commodity" | "Usd";
  CommodityCode?: string;
  Year?: number;
  Month?: number;
  MaxLong?: number | string;
  MaxShort?: number | string;
  Active?: boolean;
  UpdatedBy?: string;
  UpdatedAt?: string;
  Commodity?: MarketCommodity;
};
