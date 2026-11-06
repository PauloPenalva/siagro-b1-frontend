import type { FlashedRow } from "siagrob1/helpers/MarketHelpers";

export type MarketPriceStatus = "ok" | "missingQuote" | "missingFx" | "missingFreight" | "invalidSetup";

/** Passo da composição do preço (chave fixa do servidor, valor e unidade). */
export type MarketPriceStep = { key: string; value: number; unit: string };

/** Linha da grade "Ordem de Compra" (`GET /market/price-grid`): JSON camelCase, datas `yyyy-MM-dd`. */
export type MarketPriceGridRow = {
  lineId: number;
  priceTableId: number;
  priceTableDescription: string;
  itemCode: string;
  itemName: string;
  lineDescription: string;
  instrumentCode: string;
  destinationId: number;
  destinationName: string;
  deliveryStartDate: string;
  deliveryEndDate: string;
  receiptDate: string;
  paymentDate: string;
  exchangeQuote: number;
  exchangeLast: number;
  changePercent: number;
  premium: number;
  spotFx: number;
  curveFx?: number;
  fxQuotedAt?: string;
  fxQuoteSource?: string;
  netFx: number;
  portPrice: number;
  freightPerTon: number;
  price: number;
  status: MarketPriceStatus;
  quotedAt: string;
  quoteSource: string;
  steps: MarketPriceStep[];
  harvestSeasonCode: string;
};

export type MarketPriceGrid = {
  harvestSeasonCode: string;
  municipalityCode: string;
  generatedAt: string;
  /** Estado da integração CMA (mesmos valores do terminal); ausente em servidor antigo. */
  connectionStatus?: string;
  connectionMessage?: string;
  rows: MarketPriceGridRow[];
};

/** Campos que piscam na grade. */
export type PriceGridFlashField = "price" | "portPrice" | "exchangeQuote" | "netFx";

export type MarketPriceGridViewRow = FlashedRow<MarketPriceGridRow, PriceGridFlashField>;

export type MarketFreightCity = { code: string; name: string; stateAbbreviation: string };

/** Formulário do diálogo "Comprar" (textos como digitados). */
export type MarketTicketForm = {
  cardCode: string; cardName: string;
  sacks: string; negotiatedPrice: string;
  warehouseCode: string; warehouseName: string;
  agentCode: string; agentName: string;
  branchCode: string; branchName: string;
  logisticRegionCode: string; logisticRegionName: string;
  notes: string;
};

/** Corpo do `POST /market/tickets`. */
export type MarketTradeTicketInput = {
  priceTableLineId: number; municipalityCode: string; cardCode: string; volumeKg: number; negotiatedPrice: number;
  warehouseCode: string; agentCode: number; branchCode: string; logisticRegionCode: string; notes: string;
};

/** Resposta do `POST /market/tickets` (só o que a tela usa). */
export type MarketTradeTicketCreated = {
  id: number; status: string; calculatedPrice: number; negotiatedPrice: number; deviationPercent: number;
  requiresBoardApproval: boolean; boardApprovalReason: string;
};
