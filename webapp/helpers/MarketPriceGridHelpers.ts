import { clearRowFlashes, computeFlashes, EMPTY_VALUE, formatQuoteValue } from "siagrob1/helpers/MarketHelpers";
import { parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import {
  MarketPriceGridRow, MarketPriceGridViewRow, MarketTicketForm, MarketTradeTicketInput, PriceGridFlashField
} from "siagrob1/types/MarketPriceGrid";

/**
 * Funções puras da grade "Ordem de Compra" e do diálogo "Comprar". Devolvem CHAVES de i18n quando
 * precisam de texto; o controller traduz.
 */

export const PRICE_GRID_FLASH_FIELDS: PriceGridFlashField[] = ["price", "portPrice", "exchangeQuote", "netFx"];

/** Quilos da saca: a boleta guarda volume em kg, o comprador digita sacas de 60 kg. */
export const KG_PER_SACK = 60;

/** Piscadas da grade: comparadas pela linha da tabela de preços (`lineId`). */
export function withPriceGridFlashes(
  previous: MarketPriceGridRow[], next: MarketPriceGridRow[], seq: number, now: number
): MarketPriceGridViewRow[] {
  return computeFlashes<MarketPriceGridRow, PriceGridFlashField, number>(
    previous, next, (row) => row.lineId, PRICE_GRID_FLASH_FIELDS, seq, now);
}

export function clearPriceGridFlashes(rows: MarketPriceGridRow[]): MarketPriceGridViewRow[] {
  return clearRowFlashes(rows, PRICE_GRID_FLASH_FIELDS);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const money = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fx = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const free = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 });

/** R$ com 2 casas; sem valor vira "–" (linha sem preço nunca mostra 0). */
export function formatMoney(value: number): string {
  return isNumber(value) ? money.format(value) : EMPTY_VALUE;
}

/** Dólar com 4 casas. */
export function formatFx(value: number): string {
  return isNumber(value) ? fx.format(value) : EMPTY_VALUE;
}

/** Número como foi informado (até 6 casas, sem zeros à direita). */
export function formatPlain(value: number): string {
  return isNumber(value) ? free.format(value) : EMPTY_VALUE;
}

/** `yyyy-MM-dd` → `dd/MM/yyyy` (sem passar por Date: data de negócio não tem fuso). */
export function formatIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : EMPTY_VALUE;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Período de entrega curto: mês cheio vira `MM/yyyy` (`03/2027–04/2027`, ou só `03/2027` num mês só);
 * datas quebradas viram `dd/MM/yy–dd/MM/yy`.
 */
export function formatDeliveryRange(start: string, end: string): string {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(start ?? "");
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(end ?? "");
  if (!a || !b) return EMPTY_VALUE;
  const fullMonths = a[3] === "01" && Number(b[3]) === lastDayOfMonth(Number(b[1]), Number(b[2]));
  if (fullMonths) {
    const from = `${a[2]}/${a[1]}`, to = `${b[2]}/${b[1]}`;
    return from === to ? from : `${from}–${to}`;
  }
  return `${a[3]}/${a[2]}/${a[1].slice(2)}–${b[3]}/${b[2]}/${b[1].slice(2)}`;
}

/** Chave i18n da situação; `ok` mostra "OK". */
export function priceStatusTextKey(status: string): string {
  switch (status) {
    case "ok": return "marketPriceStatusOk";
    case "missingQuote": return "marketPriceStatusMissingQuote";
    case "missingFx": return "marketPriceStatusMissingFx";
    case "missingFreight": return "marketPriceStatusMissingFreight";
    default: return "marketPriceStatusInvalidSetup";
  }
}

export function priceStatusState(status: string): "None" | "Warning" | "Error" {
  if (status === "ok") return "None";
  return status === "invalidSetup" ? "Error" : "Warning";
}

/** Chave i18n da unidade de um passo; unidade desconhecida devolve `null` (mostra como veio). */
export function stepUnitKey(unit: string): string {
  switch (unit) {
    case "quote": return "marketStepUnitQuote";
    case "USD/t": return "marketStepUnitUsdPerTon";
    case "BRL/USD": return "marketStepUnitBrlPerUsd";
    case "BRL/t": return "marketStepUnitBrlPerTon";
    case "BRL/sc": return "marketStepUnitBrlPerBag";
    default: return null;
  }
}

/** Valor de um passo da composição, com as casas da unidade: R$/sc, R$/t e USD/t 2; R$/USD 4; cotação como na grade. */
export function formatStepValue(value: number, unit: string): string {
  switch (unit) {
    case "BRL/USD": return formatFx(value);
    case "quote": return formatQuoteValue(value);
    case "BRL/sc":
    case "BRL/t":
    case "USD/t": return formatMoney(value);
    default: return formatPlain(value);
  }
}

/** Origem da cotação: "CMA" ou "Manual" (enum camelCase do servidor). */
export function quoteSourceText(source: string): string {
  if (!source) return EMPTY_VALUE;
  return source.toLowerCase() === "manual" ? "Manual" : source.toUpperCase();
}

/** Só uma linha com preço calculado pode virar boleta. */
export function canBuy(row: Pick<MarketPriceGridRow, "status" | "price">): boolean {
  return !!row && row.status === "ok" && isNumber(row.price);
}

/** Desvio do preço negociado sobre o da grade, em % com sinal; nulo sem os dois números. */
export function priceDeviationPercent(negotiated: number, calculated: number): number {
  if (!isNumber(negotiated) || !isNumber(calculated) || calculated === 0) return null;
  return ((negotiated - calculated) / calculated) * 100;
}

/** Sacas → toneladas (60 kg a saca). */
export function sacksToTons(sacks: number): number {
  return isNumber(sacks) ? (sacks * KG_PER_SACK) / 1000 : null;
}

export type TicketFieldError = "required" | "invalid" | "ambiguous" | "positive";

export type TicketValidation = {
  payload?: MarketTradeTicketInput;
  errors: Partial<Record<keyof MarketTicketForm, TicketFieldError>>;
};

/**
 * Valida o formulário "Comprar" e monta o corpo do POST. Obrigatórios: parceiro, sacas (> 0), preço
 * (> 0), armazém, agente, filial e região logística. `volumeKg = sacas × 60`.
 */
export function buildTicketPayload(form: MarketTicketForm, lineId: number, municipalityCode: string): TicketValidation {
  const errors: TicketValidation["errors"] = {};
  const required: (keyof MarketTicketForm)[] =
    ["cardCode", "warehouseCode", "agentCode", "branchCode", "logisticRegionCode"];
  for (const field of required) {
    if (!String(form?.[field] ?? "").trim()) errors[field] = "required";
  }
  // O agente é um código inteiro (Number("1,5") ou "abc" viraria NaN no corpo do POST).
  if (!errors.agentCode && !/^\d+$/.test(String(form.agentCode).trim())) errors.agentCode = "invalid";
  const positive = (field: "sacks" | "negotiatedPrice"): number => {
    const { value, error } = parseStrictDecimal(form?.[field] ?? "");
    if (error) errors[field] = error;
    else if (value === null) errors[field] = "required";
    else if (value <= 0) errors[field] = "positive";
    return value;
  };
  const sacks = positive("sacks");
  const negotiatedPrice = positive("negotiatedPrice");
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    payload: {
      priceTableLineId: lineId,
      municipalityCode,
      cardCode: form.cardCode.trim(),
      volumeKg: Math.round(sacks * KG_PER_SACK * 1000) / 1000,
      negotiatedPrice,
      warehouseCode: form.warehouseCode.trim(),
      agentCode: Number(form.agentCode),
      branchCode: form.branchCode.trim(),
      logisticRegionCode: form.logisticRegionCode.trim(),
      notes: (form.notes ?? "").trim() || null,
    },
  };
}

/** Chave i18n do erro de um campo do diálogo. */
export function ticketErrorKey(error: TicketFieldError): string {
  switch (error) {
    case "ambiguous": return "marketNumberAmbiguous";
    case "invalid": return "marketInvalidNumber";
    case "positive": return "marketTicketPositive";
    default: return "marketRequiredField";
  }
}

export type PriceGridPreference = { harvest?: string; harvestName?: string; city?: string };

export function priceGridPreferenceKey(userName: string): string {
  return `siagrob1.marketPriceGrid.${(userName ?? "").toLowerCase()}`;
}

/** Safra e cidade lembradas por usuário; sem localStorage (ou com erro) a tela segue sem lembrar. */
export function loadPriceGridPreference(storage: Storage, userName: string): PriceGridPreference {
  try {
    const raw = storage?.getItem(priceGridPreferenceKey(userName));
    const parsed = raw ? (JSON.parse(raw) as PriceGridPreference) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function savePriceGridPreference(storage: Storage, userName: string, preference: PriceGridPreference): void {
  try {
    storage?.setItem(priceGridPreferenceKey(userName), JSON.stringify(preference));
  } catch {
    // Armazenamento bloqueado (janela privada, cota): só não lembra.
  }
}
