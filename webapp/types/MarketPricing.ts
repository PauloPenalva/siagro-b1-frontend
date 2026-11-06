import { MarketInstrument } from "./MarketInstrument";

/** Entidade OData `MarketDestinations` (chave `Id`). */
export type MarketDestination = {
  Id?: number;
  Name?: string;
  Active?: boolean;
};

/** Entidade OData `MarketFreightRates` (chave `Id`); município e destino vêm no `$expand`. */
export type MarketFreightRate = {
  Id?: number;
  MunicipalityCode?: string;
  DestinationId?: number;
  RatePerTon?: number;
  ValidFrom?: string;
  CreatedBy?: string;
  CreatedAt?: string;
  Municipality?: { Code?: string; Name?: string; StateAbbreviation?: string };
  Destination?: MarketDestination;
};

/** Entidade OData `MarketPriceTables` (chave `Id`); linhas pela navegação `Lines`. */
export type MarketPriceTable = {
  Id?: number;
  Description?: string;
  ItemCode?: string;
  ItemName?: string;
  HarvestSeasonCode?: string;
  Active?: boolean;
  UpdatedBy?: string;
  UpdatedAt?: string;
  Lines?: MarketPriceTableLine[];
};

/** Entidade OData `MarketPriceTableLines` (chave `Id`). Percentuais são números de percentual (1,5 = 1,5 %). */
export type MarketPriceTableLine = {
  Id?: number;
  PriceTableId?: number;
  Description?: string;
  InstrumentCode?: string;
  FxCurveInstrumentCode?: string;
  DestinationId?: number;
  Premium?: number;
  ElevationCost?: number;
  FxDiscount?: number;
  DiscountValue?: number;
  DiscountIsPercent?: boolean;
  MarginPercent?: number;
  DailyInterestPercent?: number;
  TechnicalLossPercent?: number;
  RuralTaxPercent?: number;
  FreightCoefficientPercent?: number;
  DeliveryStartDate?: string;
  DeliveryEndDate?: string;
  ReceiptDate?: string;
  PaymentDate?: string;
  SortOrder?: number;
  Active?: boolean;
};

/** Corpo do REST `/market/trading-settings` (camelCase). */
export type MarketTradingSettings = {
  spotFxInstrumentCode: string;
  boardApprovalVolumeTons: number;
  boardApprovalDeviationPercent: number;
  contractUnitOfMeasureCode: string;
  contractFreightUmCode: string;
};

/** Formulário da tela de parâmetros: números ficam como texto até o Salvar (vírgula decimal pt-BR). */
export type MarketTradingSettingsForm = {
  spotFxInstrumentCode: string;
  boardApprovalVolumeTons: string;
  boardApprovalDeviationPercent: string;
  contractUnitOfMeasureCode: string;
  contractFreightUmCode: string;
};

/** Listas de apoio dos Selects (JSONModel `lookup`). */
export type MarketLookups = {
  instruments: MarketInstrument[];
  priceInstruments: MarketInstrument[];
  curveInstruments: MarketInstrument[];
  fxInstruments: MarketInstrument[];
  destinations: MarketDestination[];
  loaded: boolean;
};

/** Filtros da lista de fretes (JSONModel `filter`). */
export type MarketFreightRatesFilter = {
  MunicipalityName?: string;
  DestinationId?: string;
  ValidFrom?: string;
  ValidTo?: string;
};
