/** Linha do quadro de cotações (`MarketQuoteView` do backend, JSON em camelCase). */
export type MarketQuote = {
  code: string;
  description: string;
  groupName: string;
  sortOrder: number;
  last: number;
  bid: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  isSettlement: boolean;
  quotedAt: string;
  /** O SSE serializa o enum em camelCase ("cma"/"manual"); o REST pode mandar número. */
  source: string | number;
  manualOverride: boolean;
  ask?: number;
  /** Quem digitou o lançamento manual (nulo quando veio da CMA). */
  userName?: string;
};

/** Evento do SSE `/market/quotes/live`. */
export type MarketQuotesPayload = {
  version: number;
  /** Nome do enum `Disabled|Connecting|Connected|Error` (o SSE manda em camelCase). */
  status: string;
  message: string;
  quotes: MarketQuote[];
};

/** Corpo de `POST /market/quotes/{code}/manual` (`ManualQuoteInput`). */
export type ManualQuoteInput = {
  last: number;
  bid: number;
  ask: number;
  high: number;
  low: number;
  open: number;
  isSettlement: boolean;
};

/** `CmaSettingsView` / `CmaSettingsInput`. */
export type CmaSettings = {
  enabled: boolean;
  host: string;
  userName: string;
  hasPassword?: boolean;
  password?: string;
};

/** Campos de preço que piscam no terminal quando sobem ou descem. */
export type FlashField = "last" | "bid" | "high" | "low" | "open";

/** Descritor por campo: "" (parado), "up-a-7", "down-b-8"... (direção, fase alternada, sequência). */
export type FlashMap = Record<FlashField, string>;

/** Linha do terminal no cliente: o `flash` só existe no JSONModel, nunca vai ao servidor. */
export type MarketQuoteRow = MarketQuote & { flash: FlashMap };
