import { EMPTY_VALUE } from "siagrob1/helpers/MarketHelpers";
import { fixed, formatIsoDate, formatPnl, pnlState, toCamel, toNumber } from "siagrob1/helpers/MarketHedgeHelpers";
import { numberErrorKey, parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import { MarketFxHedgePayload } from "siagrob1/types/MarketHedges";

/**
 * Funções puras da tela de Hedge de Moeda (NDF/termo). Devolvem CHAVES de i18n quando precisam de texto;
 * o controller traduz. O OData entrega enums em PascalCase e o REST em camelCase: tudo aqui normaliza.
 */

// ---------------------------------------------------------------------------------------------
// Formatação e enums
// ---------------------------------------------------------------------------------------------

/** Taxa de câmbio sempre com 4 casas ("5,4500"); ausente vira "–". */
export function formatRate(value: unknown): string {
  const n = toNumber(value);
  return n === null ? EMPTY_VALUE : fixed(n, 4, 4);
}

/** Valor em US$ com 2 casas e símbolo ("US$ 100.000,00"). */
export function formatUsd(value: unknown): string {
  const n = toNumber(value);
  return n === null ? EMPTY_VALUE : `US$ ${fixed(n, 2, 2)}`;
}

export function fxKindTextKey(kind: string): string {
  const key = toCamel(kind ?? "");
  return key === "ndf" || key === "forward" ? `marketFxKind_${key}` : "marketFxKind_unknown";
}

export function fxStatusTextKey(status: string): string {
  const key = toCamel(status ?? "");
  return ["open", "settled", "canceled"].includes(key) ? `marketFxStatus_${key}` : "marketFxStatus_unknown";
}

/** Aberto = atenção (ainda há exposição); liquidado = sucesso; cancelado = neutro. */
export function fxStatusState(status: string): "Warning" | "Success" | "None" {
  const key = toCamel(status ?? "");
  if (key === "open") return "Warning";
  return key === "settled" ? "Success" : "None";
}

/** Resultado em R$ da grade: só existe quando liquidado (aberto/cancelado = "–"). */
export function formatFxResult(value: unknown): string {
  return formatPnl(value, "brl");
}

export const fxResultState = pnlState;

/** Origem da taxa sugerida: chave de i18n e, quando há, a data (`dd/MM`) como argumento. */
export function suggestedRateSourceKey(source: string): string {
  if (source === "dailyClose") return "marketFxSuggestedDailyClose";
  return source === "lastQuote" ? "marketFxSuggestedLastQuote" : "marketFxSuggestedNone";
}

/** "dd/MM" de um `yyyy-MM-dd`; ausente vira "–". */
export function formatDayMonth(iso: string): string {
  const full = formatIsoDate(iso);
  return full === EMPTY_VALUE ? EMPTY_VALUE : full.slice(0, 5);
}

// ---------------------------------------------------------------------------------------------
// Resultado da liquidação
// ---------------------------------------------------------------------------------------------

/** Arredonda a 2 casas "para longe do zero"; o `toPrecision` evita que 4999,99999999 perca o centavo. */
function roundAwayFromZero(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Number((Math.abs(value) * 100).toPrecision(12)))) / 100;
}

/**
 * Resultado em R$ da liquidação (mesma regra do servidor): venda de US$ = (taxa contratada − taxa de
 * liquidação) × US$; compra = o inverso; 2 casas. Sem dado válido devolve `null`.
 */
export function fxSettlementResult(side: string, contractedRate: unknown, settlementRate: unknown, amountUsd: unknown): number {
  const contracted = toNumber(contractedRate), settlement = toNumber(settlementRate), amount = toNumber(amountUsd);
  if (contracted === null || settlement === null || amount === null) return null;
  const sign = toCamel(side ?? "") === "buy" ? -1 : 1;
  return roundAwayFromZero(sign * (contracted - settlement) * amount);
}

// ---------------------------------------------------------------------------------------------
// Ações da linha selecionada
// ---------------------------------------------------------------------------------------------

export type FxHedgeActions = {
  canEdit: boolean; canDelete: boolean; canSettle: boolean; canReopen: boolean; canCancel: boolean;
  canConfirm: boolean; canUnconfirm: boolean;
  /** Chave i18n do porquê Editar/Excluir estão bloqueados; vazio quando não há bloqueio. */
  blockedKey: string;
};

/**
 * Quais botões o hedge selecionado aceita. Editar/Excluir só em aberto e não conferido; Liquidar e Cancelar
 * só em aberto; Reabrir só em liquidado. Sem permissão de gravação nada é habilitado.
 */
export function fxHedgeActions(hedge: { Status?: string; Confirmed?: boolean }, canManage: boolean): FxHedgeActions {
  const none: FxHedgeActions = {
    canEdit: false, canDelete: false, canSettle: false, canReopen: false, canCancel: false,
    canConfirm: false, canUnconfirm: false, blockedKey: "",
  };
  if (!hedge || !canManage) return none;
  const status = toCamel(hedge.Status ?? "");
  const confirmed = hedge.Confirmed === true;
  let blockedKey = "";
  if (status !== "open") blockedKey = "marketFxBlockedNotOpen";
  else if (confirmed) blockedKey = "marketFxBlockedConfirmed";
  const free = blockedKey === "";
  return {
    canEdit: free, canDelete: free, canSettle: status === "open", canReopen: status === "settled",
    canCancel: status === "open", canConfirm: !confirmed, canUnconfirm: confirmed, blockedKey,
  };
}

// ---------------------------------------------------------------------------------------------
// Filtro e totais
// ---------------------------------------------------------------------------------------------

/** Situação do filtro: `recent` = abertos + liquidados nos últimos 30 dias (padrão); `all` = sem filtro. */
export type FxStatusFilter = "recent" | "Open" | "Settled" | "Canceled" | "all";

export type FxHedgesFilter = { Status?: FxStatusFilter; AccountId?: string; SettleFrom?: string; SettleTo?: string };

export const FX_RECENT_DAYS = 30;

/** Filtro padrão da lista: abertos e liquidados recentes. */
export function defaultFxFilter(): FxHedgesFilter {
  return { Status: "recent", AccountId: "", SettleFrom: "", SettleTo: "" };
}

/**
 * `$filter` cru da lista (enum nunca vai por `Filter`). "Recentes" = abertos OU liquidados cujo carimbo de
 * liquidação (UTC) é de até 30 dias atrás; `now` é injetado para o teste. Datas `Edm.Date` entram sem aspas.
 */
export function buildFxHedgesFilter(filter: FxHedgesFilter, now: Date): string {
  const parts: string[] = [];
  const status = filter?.Status ?? "recent";
  if (status === "recent") {
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - FX_RECENT_DAYS).toISOString();
    parts.push(`(Status eq 'Open' or (Status eq 'Settled' and SettledAt ge ${since}))`);
  } else if (status !== "all") {
    parts.push(`Status eq '${status}'`);
  }
  if (filter?.AccountId && Number.isInteger(Number(filter.AccountId))) parts.push(`AccountId eq ${Number(filter.AccountId)}`);
  if (filter?.SettleFrom) parts.push(`SettlementDate ge ${filter.SettleFrom}`);
  if (filter?.SettleTo) parts.push(`SettlementDate le ${filter.SettleTo}`);
  return parts.length ? parts.join(" and ") : undefined;
}

export type FxTotals = { openBoughtUsd: number; openSoldUsd: number; realizedBrl: number };

/** Totais do rodapé sobre as linhas filtradas, em centavos inteiros: US$ comprado/vendido em aberto e R$ realizado. */
export function fxTotals(rows: { Status?: string; Side?: string; AmountUsd?: unknown; RealizedPnlBrl?: unknown }[]): FxTotals {
  let bought = 0, sold = 0, realized = 0;
  for (const row of rows ?? []) {
    const status = toCamel(row.Status ?? "");
    if (status === "open") {
      const amount = toNumber(row.AmountUsd);
      if (amount === null) continue;
      if (toCamel(row.Side ?? "") === "buy") bought += Math.round(amount * 100);
      else sold += Math.round(amount * 100);
    } else if (status === "settled") {
      const pnl = toNumber(row.RealizedPnlBrl);
      if (pnl !== null) realized += Math.round(pnl * 100);
    }
  }
  return { openBoughtUsd: bought / 100, openSoldUsd: sold / 100, realizedBrl: realized / 100 };
}

// ---------------------------------------------------------------------------------------------
// Formulário do hedge
// ---------------------------------------------------------------------------------------------

/** Estado do diálogo (data/hora como `Date`, números como o texto digitado, enums em camelCase). */
export type FxHedgeForm = {
  tradedAt: Date;
  accountId: string;
  kind: string;
  side: string;
  amountUsd: string;
  contractedRate: string;
  /** `yyyy-MM-dd`. */
  settlementDate: string;
  bankReference: string;
  purchaseContractKey: string;
  salesContractKey: string;
  notes: string;
};

export type FxHedgeField = "tradedAt" | "accountId" | "kind" | "side" | "amountUsd" | "contractedRate" | "settlementDate";

/** Erro por campo = chave de i18n. */
export type FxHedgeFormErrors = Partial<Record<FxHedgeField, string>>;

const blankToNull = (value: string): string => (value ?? "").trim() || null;

/** Valida e monta o corpo do POST/PUT: data local vira instante UTC (`...Z`); só UM vínculo de contrato segue. */
export function buildFxHedgePayload(form: FxHedgeForm): { payload?: MarketFxHedgePayload; errors: FxHedgeFormErrors } {
  const errors: FxHedgeFormErrors = {};
  if (!(form.tradedAt instanceof Date) || Number.isNaN(form.tradedAt.getTime())) errors.tradedAt = "marketFuturesTradedAtRequired";
  if (!form.accountId) errors.accountId = "marketRequiredField";
  if (!form.kind) errors.kind = "marketRequiredField";
  if (!form.side) errors.side = "marketRequiredField";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.settlementDate ?? "")) errors.settlementDate = "marketFxSettlementDateRequired";

  const amount = parseStrictDecimal(form.amountUsd);
  if (amount.error) errors.amountUsd = numberErrorKey(amount.error);
  else if (!(amount.value > 0)) errors.amountUsd = "marketFxAmountInvalid";

  const rate = parseStrictDecimal(form.contractedRate);
  if (rate.error) errors.contractedRate = numberErrorKey(rate.error);
  else if (!(rate.value > 0)) errors.contractedRate = "marketFxRateInvalid";

  if (Object.keys(errors).length) return { errors };
  const purchase = blankToNull(form.purchaseContractKey);
  return {
    errors,
    payload: {
      tradedAt: form.tradedAt.toISOString(),
      accountId: Number(form.accountId),
      kind: form.kind,
      side: form.side,
      amountUsd: amount.value,
      contractedRate: rate.value,
      settlementDate: form.settlementDate,
      bankReference: blankToNull(form.bankReference),
      purchaseContractKey: purchase,
      // Os dois vínculos nunca seguem juntos: a compra vence se a tela deixou os dois preenchidos.
      salesContractKey: purchase ? null : blankToNull(form.salesContractKey),
      notes: blankToNull(form.notes),
    },
  };
}

/** Taxa de liquidação digitada: `error` para número recusado, `value` nulo quando vazio. */
export function parseSettlementRate(text: string): { value: number; errorKey?: string } {
  const parsed = parseStrictDecimal(text);
  if (parsed.error) return { value: null, errorKey: numberErrorKey(parsed.error) };
  if (parsed.value === null) return { value: null };
  return parsed.value > 0 ? { value: parsed.value } : { value: null, errorKey: "marketFxRateInvalid" };
}
