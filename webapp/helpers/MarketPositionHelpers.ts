import { computeFlashes, EMPTY_VALUE } from "siagrob1/helpers/MarketHelpers";
import { parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import {
  MarketPositionAlert, MarketPositionBucket, MarketPositionCard, MarketPositionCommodity, MarketPositionRow, MarketPositionSnapshot,
  MarketPositionUsdBucket, MarketPositionUsdRow, PositionFlashField
} from "siagrob1/types/MarketPosition";

/** Função de tradução injetada (o controller passa o ResourceBundle; os testes, uma função simples). */
export type TextFn = (key: string, args?: unknown[]) => string;

export const POSITION_FLASH_FIELDS: PositionFlashField[] = ["lastPrice", "futuresUnrealized", "physicalExchangeMtm"];

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const signed3 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3, signDisplay: "exceptZero" });
const fixed2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });
const fixed3 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fixed4 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Toneladas com sinal e 3 casas (+ comprado, − vendido). */
export function formatTons(value: number): string {
  return isNumber(value) ? signed3.format(value) : EMPTY_VALUE;
}

/** Valor com 2 casas (preços, US$, R$); nulo vira "–". */
export function formatAmount(value: number): string {
  return isNumber(value) ? fixed2.format(value) : EMPTY_VALUE;
}

/** Valor com sinal e 2 casas (líquido em US$). */
export function formatSignedAmount(value: number): string {
  return isNumber(value) ? signed2.format(value) : EMPTY_VALUE;
}

export function formatFxRate(value: number): string {
  return isNumber(value) ? fixed4.format(value) : EMPTY_VALUE;
}

/** Quantidade inteira sem sinal (contratos sem referência); zero ou nulo vira "–". */
export function formatCount(value: number): string {
  return isNumber(value) && value !== 0 ? Math.abs(Math.round(value)).toLocaleString("pt-BR") : EMPTY_VALUE;
}

/**
 * Texto do alerta de limite: "Soja — 07/2027: posição comprada de 1.234,500 t acima do limite de 1.000,000 t".
 * Valor em módulo (o sentido vai na palavra); commodity em t, dólar em US$.
 */
export function alertText(alert: Pick<MarketPositionAlert, "scope" | "description" | "value" | "limitValue" | "state">, text: TextFn): string {
  const usd = alert.scope === "usd";
  const amount = (v: number): string => {
    if (!isNumber(v)) return EMPTY_VALUE;
    const abs = Math.abs(v);
    return usd ? `US$ ${fixed2.format(abs)}` : `${fixed3.format(abs)} t`;
  };
  const direction = text(alert.state === "shortExceeded" ? "marketPositionAlertShort" : "marketPositionAlertLong");
  return text("marketPositionAlert", [alert.description ?? "", direction, amount(alert.value), amount(alert.limitValue)]);
}

export function formatPercent(value: number): string {
  return isNumber(value) ? `${fixed2.format(value)}%` : EMPTY_VALUE;
}

/** Negativo em vermelho; o resto neutro. */
export function signState(value: number): "Error" | "None" {
  return isNumber(value) && value < 0 ? "Error" : "None";
}

/** Rótulo curto da moeda do contrato/instrumento (enum camelCase do REST). */
export function currencyLabel(currency: string): string {
  switch ((currency ?? "").toLowerCase()) {
    case "usd": return "US$";
    case "brl": return "R$";
    case "usc": return "US¢";
    default: return currency ?? "";
  }
}

/** "07/2026"; sem ano/mês = balde "sem vencimento". */
export function maturityLabel(year: number, month: number, noMaturityText: string): string {
  if (year == null || month == null) return noMaturityText;
  return `${String(month).padStart(2, "0")}/${year}`;
}

export function limitStateTextKey(state: string): string {
  switch (state) {
    case "ok": return "marketPositionLimitOk";
    case "longExceeded": return "marketPositionLimitLong";
    case "shortExceeded": return "marketPositionLimitShort";
    default: return "marketPositionLimitNone";
  }
}

export function limitStateValue(state: string): "Success" | "Error" | "None" {
  if (state === "ok") return "Success";
  if (state === "longExceeded" || state === "shortExceeded") return "Error";
  return "None";
}

/** Palavra do sentido do líquido: comprado (+), vendido (−) ou zerado. */
export function directionTextKey(net: number): string {
  if (!isNumber(net) || net === 0) return "marketPositionFlat";
  return net > 0 ? "marketPositionLong" : "marketPositionShort";
}

export function bucketRowKey(commodityCode: string, year: number, month: number): string {
  return `${commodityCode}|${year ?? "-"}|${month ?? "-"}`;
}

export function totalRowKey(commodityCode: string): string {
  return `${commodityCode}|total`;
}

/** Achata commodities → linhas de uma só grade: os baldes de cada commodity seguidos da linha de total. */
export function flattenCommodityRows(commodities: MarketPositionCommodity[]): MarketPositionRow[] {
  const rows: MarketPositionRow[] = [];
  for (const commodity of commodities ?? []) {
    for (const bucket of commodity.buckets ?? []) {
      rows.push({
        ...bucket, rowKey: bucketRowKey(commodity.code, bucket.year, bucket.month),
        commodityCode: commodity.code, commodityName: commodity.name, isTotal: false,
        noMaturity: bucket.year == null || bucket.month == null,
      });
    }
    if (commodity.total) {
      rows.push({
        ...commodity.total, year: null, month: null, rowKey: totalRowKey(commodity.code),
        commodityCode: commodity.code, commodityName: commodity.name, isTotal: true, noMaturity: false,
      });
    }
  }
  return rows;
}

export function flattenUsdRows(usd: MarketPositionSnapshot["usd"]): MarketPositionUsdRow[] {
  const rows: MarketPositionUsdRow[] = (usd?.buckets ?? []).map((b) => ({ ...b, rowKey: `usd|${b.year ?? "-"}|${b.month ?? "-"}`, isTotal: false }));
  if (usd?.total) rows.push({ ...usd.total, year: null, month: null, rowKey: "usd|total", isTotal: true });
  return rows;
}

/** Piscada de cotação e marcações entre dois quadros, pela chave commodity+ano+mês. */
export function withPositionFlashes(previous: MarketPositionRow[], next: MarketPositionRow[], seq: number, now: number): MarketPositionRow[] {
  return computeFlashes<MarketPositionRow, PositionFlashField, string>(previous, next, (r) => r.rowKey, POSITION_FLASH_FIELDS, seq, now) as MarketPositionRow[];
}

export type RowChange = { index: number; field: string; value: unknown };

/**
 * Diferença campo a campo entre dois quadros com as mesmas linhas na mesma ordem (atualização no lugar,
 * sem trocar o array: seleção e rolagem da grade ficam). `null` = estrutura mudou, trocar o array todo.
 */
export function diffRows<T extends { rowKey: string }>(previous: T[], next: T[]): RowChange[] {
  if (!previous || previous.length !== next.length) return null;
  const changes: RowChange[] = [];
  for (let index = 0; index < next.length; index++) {
    if (previous[index].rowKey !== next[index].rowKey) return null;
    const before = previous[index] as Record<string, unknown>;
    const after = next[index] as Record<string, unknown>;
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) changes.push({ index, field, value: after[field] });
    }
  }
  return changes;
}

/** Linha com contratos para abrir: total ou balde com vencimento (o "sem vencimento" só tem futuros). */
export function canDrillDown(row: Pick<MarketPositionRow, "isTotal" | "noMaturity">): boolean {
  return !!row && (row.isTotal || !row.noMaturity);
}

/** Parâmetros do `GET market/position/contracts`; linha de total omite ano e mês. */
export function drillDownQuery(row: Pick<MarketPositionRow, "commodityCode" | "year" | "month" | "isTotal">): { commodity: string; year?: number; month?: number } {
  return row.isTotal ? { commodity: row.commodityCode } : { commodity: row.commodityCode, year: row.year, month: row.month };
}

export function isPurchaseSide(side: string): boolean {
  return (side ?? "").toLowerCase().startsWith("purchase");
}

export function sideTextKey(side: string): string {
  return isPurchaseSide(side) ? "marketPositionSidePurchase" : "marketPositionSideSales";
}

/** Rota do detalhe do contrato do lado informado. */
export function contractDetailRoute(side: string): string {
  return isPurchaseSide(side) ? "purchaseContractsDetail" : "salesContractsDetail";
}

/** Segmento de `POST market/contracts/{purchase|sales}/{key}/fx-lock`. */
export function fxLockSide(side: string): "purchase" | "sales" {
  return isPurchaseSide(side) ? "purchase" : "sales";
}

/** Corpo do fx-lock: reabrir não leva taxa; fechar aceita taxa opcional positiva digitada em pt-BR. */
export function buildFxLockPayload(locked: boolean, rateText: string): { payload?: { locked: boolean; fxRate: number }; error?: "invalid" | "ambiguous" } {
  if (!locked) return { payload: { locked: false, fxRate: null } };
  const { value, error } = parseStrictDecimal(rateText);
  if (error) return { error };
  if (value !== null && value <= 0) return { error: "invalid" };
  return { payload: { locked: true, fxRate: value } };
}

type CardInput = {
  title: string;
  net: number;
  covered: number;
  hedgePercent: number;
  limitState: string;
  unit: "tons" | "usd";
  mtmText: string;
};

/** Cartão-resumo (Exposto, Travado, % hedge, marcação e limite) com os textos já resolvidos. */
export function buildCard(input: CardInput, text: TextFn): MarketPositionCard {
  const isTons = input.unit === "tons";
  const format = isTons ? formatTons : formatSignedAmount;
  const suffix = isTons ? " t" : "";
  const prefix = isTons ? "" : "US$ ";
  return {
    title: input.title,
    exposedText: isNumber(input.net) ? `${prefix}${format(input.net)}${suffix}` : EMPTY_VALUE,
    exposedState: signState(input.net),
    directionText: text(directionTextKey(input.net)),
    coveredText: isNumber(input.covered) ? `${prefix}${isTons ? formatTons(input.covered).replace(/^\+/, "") : formatAmount(input.covered)}${suffix}` : EMPTY_VALUE,
    hedgeVisible: isNumber(input.hedgePercent),
    hedgeValue: isNumber(input.hedgePercent) ? Math.max(0, Math.min(100, input.hedgePercent)) : 0,
    hedgeText: formatPercent(input.hedgePercent),
    hedgeLabel: text("marketPositionCardHedge", [formatPercent(input.hedgePercent)]),
    mtmText: input.mtmText,
    limitText: text(limitStateTextKey(input.limitState)),
    limitState: limitStateValue(input.limitState),
  };
}

/** Linha de marcação do cartão da commodity: futuros + componente de bolsa do físico, na moeda do total. */
export function commodityMtmText(total: MarketPositionBucket, text: TextFn): string {
  const currency = currencyLabel(total?.currency);
  return text("marketPositionCardMtm", [`${currency} ${formatAmount(total?.futuresUnrealized)}`.trim(), `${currency} ${formatAmount(total?.physicalExchangeMtm)}`.trim()]);
}

export function usdMtmText(total: MarketPositionUsdBucket, text: TextFn): string {
  return text("marketPositionCardUsdMtm", [`R$ ${formatAmount(total?.fxHedgeUnrealizedBrl)}`]);
}
