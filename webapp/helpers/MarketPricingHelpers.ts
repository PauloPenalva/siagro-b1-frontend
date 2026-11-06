import { MarketInstrument } from "siagrob1/types/MarketInstrument";
import {
  MarketFreightRatesFilter, MarketPriceTableLine, MarketTradingSettings, MarketTradingSettingsForm
} from "siagrob1/types/MarketPricing";
import { parseDecimalInput } from "siagrob1/helpers/MarketHelpers";

/**
 * Funções puras das telas de preço por cidade do módulo Mercado (destinos, frete, tabela de preços,
 * parâmetros). Devolvem CHAVES de i18n quando precisam de texto.
 */

/** Permissões do módulo (iguais às constantes `PermissionCodes` do servidor). */
export const MARKET_MANAGE = "MARKET_MANAGE";
export const MARKET_BOARD_APPROVE = "MARKET_BOARD_APPROVE";

/** A curva de dólar só vale (e é obrigatória) para cotação em US$. */
export function curveRequired(quoteUnit?: string): boolean {
  return quoteUnit === "UsCentsPerBushel" || quoteUnit === "UsdPerTon";
}

export function quoteUnitOf(code: string, instruments: MarketInstrument[]): string {
  return code ? (instruments ?? []).find((instrument) => instrument.Code === code)?.QuoteUnit : undefined;
}

/** Instrumentos ativos de cotação de bolsa/físico: os que entram na fórmula de preço. */
export function priceInstrumentsOf(instruments: MarketInstrument[]): MarketInstrument[] {
  return (instruments ?? []).filter((i) => i.Active !== false && (i.Type === "Future" || i.Type === "Spot"));
}

export function curveInstrumentsOf(instruments: MarketInstrument[]): MarketInstrument[] {
  return (instruments ?? []).filter((i) => i.Active !== false && i.Type === "CurvePoint");
}

/** Dólar à vista: instrumentos ativos cotados em R$/US$ que não são ponto de curva. */
export function fxInstrumentsOf(instruments: MarketInstrument[]): MarketInstrument[] {
  return (instruments ?? []).filter((i) => i.Active !== false && i.QuoteUnit === "BrlPerUsd" && i.Type !== "CurvePoint");
}

/** "Sorriso – MT"; sem UF mostra só o nome. */
export function municipalityLabel(name?: string, stateAbbreviation?: string): string {
  if (!name) return "";
  return stateAbbreviation ? `${name} – ${stateAbbreviation}` : name;
}

/** Próxima ordem de uma linha nova: de 10 em 10 depois da maior existente. */
export function nextSortOrder(lines: { SortOrder?: number }[]): number {
  const max = (lines ?? []).reduce((acc, line) => Math.max(acc, line.SortOrder ?? 0), 0);
  return max + 10;
}

/**
 * Valida uma linha da tabela de preços. Devolve a chave de i18n do primeiro problema ou `null`.
 * A curva só é exigida quando o instrumento cota em US$.
 */
export function priceLineError(line: MarketPriceTableLine, instruments: MarketInstrument[]): string {
  if (!(line.Description ?? "").trim()) return "marketLineDescriptionRequired";
  if (!line.InstrumentCode) return "marketLineInstrumentRequired";
  if (!line.DestinationId) return "marketLineDestinationRequired";
  if (curveRequired(quoteUnitOf(line.InstrumentCode, instruments)) && !line.FxCurveInstrumentCode) {
    return "marketLineCurveRequired";
  }
  return null;
}

export type StrictNumber = { value: number; error?: "invalid" | "ambiguous" };

/**
 * Leitura de número digitado nas telas de preço (pt-BR). Diferente de `parseDecimalInput` (terminal),
 * recusa "1.500": sem vírgula e com um único ponto seguido de exatamente 3 dígitos não dá para saber
 * se é milhar ou decimal (erro de 1000x em volume/dinheiro). Com vírgula, pontos são milhar
 * ("1.500,25" = 1500,25); "1500", "1500.5" e "1,5" continuam válidos. Vazio = `null` sem erro.
 */
export function parseStrictDecimal(text: string): StrictNumber {
  const raw = (text ?? "").trim();
  if (!raw) return { value: null };
  if (!raw.includes(",") && /^-?\d+\.\d{3}$/.test(raw)) return { value: null, error: "ambiguous" };
  const value = parseDecimalInput(raw);
  return Number.isNaN(value) ? { value: null, error: "invalid" } : { value };
}

/** Número no formato digitado pt-BR, sem separador de milhar (reler "1500,25" nunca é ambíguo). */
export function formatStrictDecimal(value: number): string {
  return value == null ? "" : value.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 6 });
}

/** Chave de i18n do texto de erro de um número recusado. */
export function numberErrorKey(error: "invalid" | "ambiguous"): string {
  return error === "ambiguous" ? "marketNumberAmbiguous" : "marketInvalidNumber";
}

export function tradingSettingsToForm(settings?: Partial<MarketTradingSettings>): MarketTradingSettingsForm {
  const text = (value?: number): string => (value == null ? "" : String(value).replace(".", ","));
  return {
    spotFxInstrumentCode: settings?.spotFxInstrumentCode ?? "",
    boardApprovalVolumeTons: text(settings?.boardApprovalVolumeTons),
    boardApprovalDeviationPercent: text(settings?.boardApprovalDeviationPercent),
    contractUnitOfMeasureCode: settings?.contractUnitOfMeasureCode ?? "",
    contractFreightUmCode: settings?.contractFreightUmCode ?? "",
  };
}

/**
 * Monta o corpo do PUT. Campo vazio vira `null` (regra desligada / sem valor); número inválido ou
 * negativo é devolvido em `invalid` (nomes dos campos do formulário) e não gera corpo.
 */
export function buildTradingSettingsPayload(
  form: MarketTradingSettingsForm
): {
  payload?: MarketTradingSettings;
  invalid: (keyof MarketTradingSettingsForm)[];
  errors: Partial<Record<keyof MarketTradingSettingsForm, "invalid" | "ambiguous">>;
} {
  const invalid: (keyof MarketTradingSettingsForm)[] = [];
  const errors: Partial<Record<keyof MarketTradingSettingsForm, "invalid" | "ambiguous">> = {};
  const number = (field: "boardApprovalVolumeTons" | "boardApprovalDeviationPercent"): number => {
    const { value, error } = parseStrictDecimal(form[field] ?? "");
    if (error || (value !== null && value < 0)) {
      invalid.push(field);
      errors[field] = error ?? "invalid";
      return null;
    }
    return value;
  };
  const text = (value?: string): string => (value ?? "").trim() || null;

  const boardApprovalVolumeTons = number("boardApprovalVolumeTons");
  const boardApprovalDeviationPercent = number("boardApprovalDeviationPercent");
  if (invalid.length) return { invalid, errors };
  return {
    invalid,
    errors,
    payload: {
      spotFxInstrumentCode: text(form.spotFxInstrumentCode),
      boardApprovalVolumeTons,
      boardApprovalDeviationPercent,
      contractUnitOfMeasureCode: text(form.contractUnitOfMeasureCode),
      contractFreightUmCode: text(form.contractFreightUmCode),
    },
  };
}

/** Escapa apóstrofo para literal OData. */
function odataString(value: string): string {
  return value.replace(/'/g, "''");
}

/** `$filter` cru da lista de fretes (datas `Edm.Date` entram sem aspas); `undefined` remove o parâmetro. */
export function buildFreightRatesFilter(filter: MarketFreightRatesFilter): string {
  const parts: string[] = [];
  const name = (filter?.MunicipalityName ?? "").trim();
  if (name) parts.push(`contains(Municipality/Name,'${odataString(name)}')`);
  if (filter?.DestinationId) parts.push(`DestinationId eq ${Number(filter.DestinationId)}`);
  if (filter?.ValidFrom) parts.push(`ValidFrom ge ${filter.ValidFrom}`);
  if (filter?.ValidTo) parts.push(`ValidFrom le ${filter.ValidTo}`);
  return parts.length ? parts.join(" and ") : undefined;
}
