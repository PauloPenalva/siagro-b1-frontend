import { EMPTY_VALUE } from "siagrob1/helpers/MarketHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { numberErrorKey, parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import { MarketCounterparty, MarketFuturesTradePayload, MarketLotInfo } from "siagrob1/types/MarketHedges";

/**
 * Funções puras das telas de hedge do módulo Mercado (corretoras, ajustes de margem, operações de bolsa).
 * Devolvem CHAVES de i18n quando precisam de texto; o controller traduz. O OData entrega enums em
 * PascalCase e o REST em camelCase: tudo aqui normaliza.
 */

/** Decimal do OData pode chegar como texto: converte sem inventar zero para valor ausente. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Enum do OData (`Buy`) ou do REST (`buy`) em camelCase. */
export function toCamel(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : "";
}

/** Enum em PascalCase (valor do OData). */
export function toPascal(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

// ---------------------------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------------------------

export function fixed(value: number, min: number, max: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });
}

/** 2 casas, milhar com ponto ("1.250,00"); ausente vira "–". */
export function formatMoney(value: unknown): string {
  const n = toNumber(value);
  return n === null ? EMPTY_VALUE : fixed(n, 2, 2);
}

/** Preço de bolsa como cotado: no mínimo 2 e no máximo 6 casas. */
export function formatPrice(value: unknown): string {
  const n = toNumber(value);
  return n === null ? EMPTY_VALUE : fixed(n, 2, 6);
}

/** Com sinal explícito para positivos ("+6.250,00"); zero e ausente sem sinal. */
export function formatSigned(value: unknown, decimals = 2): string {
  const n = toNumber(value);
  if (n === null) return EMPTY_VALUE;
  const text = fixed(n, decimals, decimals);
  return n > 0 ? `+${text}` : text;
}

/** Valor com moeda, sem sinal: "R$ 1.250,00". */
export function formatCurrency(value: unknown, currency: string): string {
  const n = toNumber(value);
  if (n === null) return EMPTY_VALUE;
  const symbol = currencySymbol(currency);
  return symbol ? `${symbol} ${fixed(n, 2, 2)}` : fixed(n, 2, 2);
}

/** Toneladas sem sinal e 3 casas (equivalente de lotes digitados). */
export function formatTons(value: unknown): string {
  const n = toNumber(value);
  return n === null ? EMPTY_VALUE : fixed(n, 3, 3);
}

/** Toneladas com sinal e 3 casas. */
export function formatSignedTons(value: unknown): string {
  return formatSigned(value, 3);
}

/** Lotes líquidos com sinal ("+10", "-5"). */
export function formatSignedLots(value: unknown): string {
  return formatSigned(value, 0);
}

/** Número inteiro com milhar. */
export function formatLots(value: unknown): string {
  const n = toNumber(value);
  return n === null ? EMPTY_VALUE : fixed(n, 0, 0);
}

/** Cor do resultado: verde ganho, vermelho perda; olha o valor já arredondado a 2 casas. */
export function pnlState(value: unknown): "Success" | "Error" | "None" {
  const n = toNumber(value);
  if (n === null) return "None";
  const cents = Math.round(n * 100);
  if (cents > 0) return "Success";
  return cents < 0 ? "Error" : "None";
}

/** "R$" ou "US$" para a moeda do OData (`Brl`) ou do REST (`brl`). */
export function currencySymbol(currency: string): string {
  const key = toCamel(currency ?? "");
  if (key === "brl") return "R$";
  return key === "usd" ? "US$" : "";
}

/** Resultado com moeda e sinal: "US$ +6.250,00". */
export function formatPnl(value: unknown, currency: string): string {
  const n = toNumber(value);
  if (n === null) return EMPTY_VALUE;
  const symbol = currencySymbol(currency);
  return symbol ? `${symbol} ${formatSigned(n)}` : formatSigned(n);
}

/** Posição: toneladas quando há (commodity); senão o nocional em US$ (dólar futuro). */
export function formatTonsOrUsd(tons: unknown, usd: unknown): string {
  if (toNumber(tons) !== null) return `${formatSignedTons(tons)} t`;
  return toNumber(usd) !== null ? `US$ ${formatSigned(usd)}` : EMPTY_VALUE;
}

/** `yyyy-MM-dd` (com ou sem hora) para `dd/MM/yyyy`; ausente vira "–". */
export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : EMPTY_VALUE;
}

/** "Corretora – conta". */
export function accountLabel(counterpartyName: string, accountCode: string): string {
  if (!accountCode) return counterpartyName || EMPTY_VALUE;
  return counterpartyName ? `${counterpartyName} – ${accountCode}` : accountCode;
}

// ---------------------------------------------------------------------------------------------
// Toneladas por lote
// ---------------------------------------------------------------------------------------------

/**
 * Toneladas de UM lote (mesma aritmética do servidor): US¢/bu = tamanho / (fator × 100);
 * R$/sc = tamanho / fator; US$/t = tamanho; dólar futuro não se aplica (`null`).
 */
export function tonsPerLot(quoteUnit: string, contractSize: unknown, tonFactor: unknown): number {
  const size = toNumber(contractSize), factor = toNumber(tonFactor);
  if (size === null) return null;
  switch (toPascal(quoteUnit ?? "")) {
    case "UsCentsPerBushel":
      return factor ? size / (factor * 100) : null;
    case "BrlPerBag":
      return factor ? size / factor : null;
    case "UsdPerTon":
      return size;
    default:
      return null;
  }
}

/** Toneladas com sinal da operação inteira (compra +, venda −) para a grade; `null` sem equivalência. */
export function tradeTons(
  lots: unknown, side: string, quoteUnit: string, contractSize: unknown, tonFactor: unknown
): number {
  const perLot = tonsPerLot(quoteUnit, contractSize, tonFactor), count = toNumber(lots);
  if (perLot === null || count === null) return null;
  return (toCamel(side ?? "") === "sell" ? -1 : 1) * count * perLot;
}

/** Formatter da coluna Toneladas da grade (cada parte do binding vem com `targetType: 'any'`). */
export function formatTradeTons(lots: unknown, side: string, quoteUnit: string, contractSize: unknown, tonFactor: unknown): string {
  const tons = tradeTons(lots, side, quoteUnit, contractSize, tonFactor);
  return tons === null ? EMPTY_VALUE : formatSignedTons(tons);
}

export type LotEquivalent = { kind: "tons" | "usd"; value: number };

/** Lotes digitados: só inteiro positivo; qualquer outra coisa é `null`. */
export function parseLots(text: string): number {
  const raw = (text ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const lots = Number(raw);
  return lots > 0 && Number.isSafeInteger(lots) ? lots : null;
}

/** Equivalente de N lotes pelo `lot-info`: toneladas, ou US$ no dólar futuro; sem dado, `null`. */
export function lotEquivalent(info: MarketLotInfo, lots: number): LotEquivalent {
  if (!info || !(lots > 0)) return null;
  const perLot = toNumber(info.tonsPerLot);
  if (perLot !== null) return { kind: "tons", value: lots * perLot };
  const usd = toNumber(info.usdPerLot);
  return usd !== null ? { kind: "usd", value: lots * usd } : null;
}

// ---------------------------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------------------------

export function sideTextKey(side: string): string {
  const key = toCamel(side ?? "");
  return key === "buy" || key === "sell" ? `marketHedgeSide_${key}` : "marketHedgeSide_unknown";
}

export function reasonTextKey(reason: string): string {
  const key = toCamel(reason ?? "");
  return ["normal", "rollover", "efp"].includes(key) ? `marketFuturesReason_${key}` : "marketFuturesReason_unknown";
}

export function counterpartyTypeTextKey(type: string): string {
  const key = toCamel(type ?? "");
  return key === "broker" || key === "bank" ? `marketCounterpartyType_${key}` : "marketCounterpartyType_unknown";
}

// ---------------------------------------------------------------------------------------------
// Contas e filtros
// ---------------------------------------------------------------------------------------------

export type AccountOption = { id: string; label: string };

/**
 * Contas dos cadastros de corretora/banco para os Selects ("Corretora – conta"). `onlyActive` exige
 * corretora E conta ativas (lançamento novo); sem ele lista tudo (filtros de consulta de histórico).
 */
export function accountOptions(counterparties: MarketCounterparty[], type: "Broker" | "Bank", onlyActive: boolean): AccountOption[] {
  const options: AccountOption[] = [];
  for (const counterparty of counterparties ?? []) {
    if (toPascal(counterparty.Type ?? "") !== type) continue;
    if (onlyActive && counterparty.Active === false) continue;
    for (const account of counterparty.Accounts ?? []) {
      if (onlyActive && account.Active === false) continue;
      options.push({ id: String(account.Id), label: accountLabel(counterparty.Name, account.Code) });
    }
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

const esc = (value: string) => value.replace(/'/g, "''");

export type PeriodAccountFilter = { From?: string; To?: string; AccountId?: string };
export type FuturesTradesFilter = PeriodAccountFilter & { InstrumentCode?: string; OnlyUnconfirmed?: boolean };

function periodAccountParts(dateField: string, filter: PeriodAccountFilter): string[] {
  const parts: string[] = [];
  // Edm.Date entra no $filter sem aspas.
  if (filter?.From) parts.push(`${dateField} ge ${filter.From}`);
  if (filter?.To) parts.push(`${dateField} le ${filter.To}`);
  if (filter?.AccountId && Number.isInteger(Number(filter.AccountId))) parts.push(`AccountId eq ${Number(filter.AccountId)}`);
  return parts;
}

/** `$filter` cru da lista de ajustes e margem (conta + período em `Date`); `undefined` remove o parâmetro. */
export function buildStatementsFilter(filter: PeriodAccountFilter): string {
  const parts = periodAccountParts("Date", filter);
  return parts.length ? parts.join(" and ") : undefined;
}

/** `$filter` cru da lista de operações de bolsa (período em `TradeDate`). */
export function buildFuturesTradesFilter(filter: FuturesTradesFilter): string {
  const parts = periodAccountParts("TradeDate", filter);
  if (filter?.InstrumentCode) parts.push(`InstrumentCode eq '${esc(filter.InstrumentCode)}'`);
  if (filter?.OnlyUnconfirmed) parts.push("Confirmed eq false");
  return parts.length ? parts.join(" and ") : undefined;
}

/** Filtro padrão da lista de operações: os últimos 30 dias (data local). */
export function defaultTradesFilter(today: Date): FuturesTradesFilter {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
  return { From: localIsoDate(from), To: "", AccountId: "", InstrumentCode: "", OnlyUnconfirmed: false };
}

/** Período padrão do resultado realizado: do dia 1º do mês até hoje. */
export function defaultRealizedPeriod(today: Date): { from: string; to: string } {
  return { from: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: localIsoDate(today) };
}

// ---------------------------------------------------------------------------------------------
// Ações da operação selecionada
// ---------------------------------------------------------------------------------------------

export type TradeActions = {
  canEdit: boolean; canDelete: boolean; canConfirm: boolean; canUnconfirm: boolean;
  /** Chave i18n do porquê Editar/Excluir estão bloqueados; vazio quando não há bloqueio. */
  blockedKey: string;
};

/**
 * Quais botões a operação selecionada aceita. Gerada por EFP não se edita nem exclui (o EFP manda nela);
 * conferida precisa ser desmarcada antes. Sem permissão de gravação nada é habilitado.
 */
export function tradeActions(trade: { Confirmed?: boolean; EfpId?: number }, canManage: boolean): TradeActions {
  const none: TradeActions = { canEdit: false, canDelete: false, canConfirm: false, canUnconfirm: false, blockedKey: "" };
  if (!trade || !canManage) return none;
  const confirmed = trade.Confirmed === true;
  let blockedKey = "";
  if (trade.EfpId !== null && trade.EfpId !== undefined) blockedKey = "marketFuturesBlockedEfp";
  else if (confirmed) blockedKey = "marketFuturesBlockedConfirmed";
  const free = blockedKey === "";
  return { canEdit: free, canDelete: free, canConfirm: !confirmed, canUnconfirm: confirmed, blockedKey };
}

// ---------------------------------------------------------------------------------------------
// Formulário da operação
// ---------------------------------------------------------------------------------------------

/** Estado do diálogo (data como `Date`, números como o texto digitado, enums em camelCase). */
export type TradeForm = {
  tradedAt: Date;
  accountId: string;
  instrumentCode: string;
  side: string;
  lots: string;
  price: string;
  fees: string;
  feesCurrency: string;
  reason: string;
  brokerReference: string;
  purchaseContractKey: string;
  salesContractKey: string;
  notes: string;
};

export type TradeField = "tradedAt" | "accountId" | "instrumentCode" | "side" | "lots" | "price" | "fees";

/** Erro por campo = chave de i18n. */
export type TradeFormErrors = Partial<Record<TradeField, string>>;

const blankToNull = (value: string): string => (value ?? "").trim() || null;

/**
 * Valida o formulário e monta o corpo do POST/PUT. A data local vira instante UTC (`...Z`); números
 * digitados passam por `parseStrictDecimal` (recusa "1.500"); só UM vínculo de contrato segue.
 */
export function buildTradePayload(form: TradeForm): { payload?: MarketFuturesTradePayload; errors: TradeFormErrors } {
  const errors: TradeFormErrors = {};
  if (!(form.tradedAt instanceof Date) || Number.isNaN(form.tradedAt.getTime())) errors.tradedAt = "marketFuturesTradedAtRequired";
  if (!form.accountId) errors.accountId = "marketRequiredField";
  if (!form.instrumentCode) errors.instrumentCode = "marketRequiredField";
  if (!form.side) errors.side = "marketRequiredField";

  const lots = parseLots(form.lots);
  if (lots === null) errors.lots = "marketFuturesLotsInvalid";

  const price = parseStrictDecimal(form.price);
  if (price.error) errors.price = numberErrorKey(price.error);
  else if (!(price.value > 0)) errors.price = "marketFuturesPriceInvalid";

  const fees = parseStrictDecimal(form.fees);
  if (fees.error) errors.fees = numberErrorKey(fees.error);
  else if (fees.value !== null && fees.value < 0) errors.fees = "marketFuturesFeesInvalid";

  if (Object.keys(errors).length) return { errors };
  const purchase = blankToNull(form.purchaseContractKey);
  return {
    errors,
    payload: {
      tradedAt: form.tradedAt.toISOString(),
      accountId: Number(form.accountId),
      instrumentCode: form.instrumentCode,
      side: form.side,
      lots,
      price: price.value,
      fees: fees.value ?? 0,
      feesCurrency: form.feesCurrency || "brl",
      reason: form.reason || "normal",
      brokerReference: blankToNull(form.brokerReference),
      purchaseContractKey: purchase,
      // Os dois vínculos nunca seguem juntos: a compra vence se a tela deixou os dois preenchidos.
      salesContractKey: purchase ? null : blankToNull(form.salesContractKey),
      notes: blankToNull(form.notes),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Totais por moeda
// ---------------------------------------------------------------------------------------------

export type CurrencyTotal = { currency: string; total: number };

/** Soma `field` por moeda (REST: `brl`/`usd`), em centavos inteiros para não acumular erro binário. */
export function totalsByCurrency<T extends { currency?: string }>(rows: T[], field: keyof T): CurrencyTotal[] {
  const cents = new Map<string, number>();
  for (const row of rows ?? []) {
    const value = toNumber(row[field]);
    if (value === null) continue;
    const key = toCamel(row.currency ?? "");
    cents.set(key, (cents.get(key) ?? 0) + Math.round(value * 100));
  }
  const order = (currency: string) => (currency === "brl" ? 0 : currency === "usd" ? 1 : 2);
  return [...cents.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([currency, total]) => ({ currency, total: total / 100 }));
}

/** Total pronto para a barra de rodapé: texto com moeda e sinal + cor. */
export function totalView(total: CurrencyTotal): { text: string; state: "Success" | "Error" | "None" } {
  return { text: formatPnl(total.total, total.currency), state: pnlState(total.total) };
}
