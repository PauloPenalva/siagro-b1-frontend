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
): { payload?: MarketTradingSettings; invalid: (keyof MarketTradingSettingsForm)[] } {
  const invalid: (keyof MarketTradingSettingsForm)[] = [];
  const number = (field: "boardApprovalVolumeTons" | "boardApprovalDeviationPercent"): number => {
    const value = parseDecimalInput(form[field] ?? "");
    if (value !== null && (Number.isNaN(value) || value < 0)) {
      invalid.push(field);
      return null;
    }
    return value;
  };
  const text = (value?: string): string => (value ?? "").trim() || null;

  const boardApprovalVolumeTons = number("boardApprovalVolumeTons");
  const boardApprovalDeviationPercent = number("boardApprovalDeviationPercent");
  if (invalid.length) return { invalid };
  return {
    invalid,
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
