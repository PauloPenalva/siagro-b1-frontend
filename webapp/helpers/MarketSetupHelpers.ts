import { parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";

/** Quilos numa saca: o preço em US$ do contrato é guardado por kg e mostrado por saca de 60 kg. */
export const KG_PER_BAG = 60;

/** US$/kg (banco) → US$/saca (tela); vazio continua vazio. */
export function usdPerKgToBag(perKg: unknown): number {
  if (perKg === null || perKg === undefined || perKg === "") return null;
  const value = Number(perKg);
  return Number.isFinite(value) ? Math.round(value * KG_PER_BAG * 1e6) / 1e6 : null;
}

/** US$/saca (tela) → US$/kg (banco), com 8 casas para a volta por saca não perder centavos. */
export function usdPerBagToKg(perBag: number): number {
  if (perBag === null || perBag === undefined) return null;
  return Math.round((perBag / KG_PER_BAG) * 1e8) / 1e8;
}

export type CommodityMonthRow = { DeliveryMonth?: number; FuturesMonth?: number; YearOffset?: number };

/** Meses de entrega (1–12) que ainda não têm linha no mapa da commodity, em ordem. */
export function missingDeliveryMonths(rows: CommodityMonthRow[]): number[] {
  const present = new Set((rows ?? []).map((row) => Number(row.DeliveryMonth)));
  const missing: number[] = [];
  for (let month = 1; month <= 12; month++) if (!present.has(month)) missing.push(month);
  return missing;
}

/** Linha padrão do mapa: entrega no mês M vence no próprio mês M do mesmo ano (o usuário ajusta). */
export function defaultCommodityMonth(deliveryMonth: number): CommodityMonthRow {
  return { DeliveryMonth: deliveryMonth, FuturesMonth: deliveryMonth, YearOffset: 0 };
}

/** Confere o mapa dos 12 meses; devolve a chave de i18n do primeiro problema ou `null`. */
export function commodityMonthsProblem(rows: CommodityMonthRow[]): string {
  const list = rows ?? [];
  if (list.length !== 12 || missingDeliveryMonths(list).length) return "marketCommodityMonthsIncomplete";
  for (const row of list) {
    const futures = Number(row.FuturesMonth);
    if (!Number.isInteger(futures) || futures < 1 || futures > 12) return "marketCommodityMonthsInvalid";
    const offset = Number(row.YearOffset);
    if (offset !== 0 && offset !== 1) return "marketCommodityMonthsInvalid";
  }
  return null;
}

/** Confere os produtos; devolve a chave de i18n do primeiro problema ou `null`. */
export function commodityItemsProblem(items: { ItemCode?: string }[]): string {
  const seen = new Set<string>();
  for (const item of items ?? []) {
    const code = (item.ItemCode ?? "").trim();
    if (!code) return "marketCommodityItemRequired";
    if (seen.has(code)) return "marketCommodityItemDuplicated";
    seen.add(code);
  }
  return null;
}

/** Período do limite: "Total" (sem ano/mês) ou MM/yyyy. */
export function limitPeriodText(year: unknown, month: unknown, totalText: string): string {
  if (year === null || year === undefined || month === null || month === undefined) return totalText;
  return `${String(Number(month)).padStart(2, "0")}/${Number(year)}`;
}

export type ExposureLimitForm = {
  scope: string;
  commodityCode: string;
  total: boolean;
  year: number;
  month: string;
  /** Textos digitados, vírgula decimal pt-BR. */
  maxLong: string;
  maxShort: string;
  active: boolean;
};

export type ExposureLimitPayload = {
  Scope: string;
  CommodityCode: string;
  Year: number;
  Month: number;
  MaxLong: number;
  MaxShort: number;
  Active: boolean;
};

export type ExposureLimitResult = {
  payload?: ExposureLimitPayload;
  /** Chave de i18n do problema. */
  error?: string;
  /** Campo com problema (`maxLong`/`maxShort`) para marcar o Input. */
  field?: "maxLong" | "maxShort";
};

/**
 * Monta o corpo do limite a partir do diálogo: commodity só no escopo Commodity; ano e mês juntos ou
 * nenhum ("Total"); ao menos um máximo, positivo.
 */
export function buildExposureLimitPayload(form: ExposureLimitForm): ExposureLimitResult {
  if (form.scope !== "Commodity" && form.scope !== "Usd") return { error: "marketLimitScopeRequired" };
  const commodityCode = form.scope === "Commodity" ? (form.commodityCode ?? "").trim() : "";
  if (form.scope === "Commodity" && !commodityCode) return { error: "marketLimitCommodityRequired" };

  let year: number = null;
  let month: number = null;
  if (!form.total) {
    year = Number(form.year);
    month = Number(form.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
      return { error: "marketLimitPeriodRequired" };
    }
  }

  const values: Record<"maxLong" | "maxShort", number> = { maxLong: null, maxShort: null };
  for (const field of ["maxLong", "maxShort"] as const) {
    const { value, error } = parseStrictDecimal(form[field]);
    if (error) return { error: error === "ambiguous" ? "marketNumberAmbiguous" : "marketInvalidNumber", field };
    if (value !== null && value <= 0) return { error: "marketLimitMustBePositive", field };
    values[field] = value;
  }
  if (values.maxLong === null && values.maxShort === null) return { error: "marketLimitMaxRequired" };

  return {
    payload: {
      Scope: form.scope,
      CommodityCode: commodityCode || null,
      Year: year,
      Month: month,
      MaxLong: values.maxLong,
      MaxShort: values.maxShort,
      Active: form.active !== false,
    },
  };
}
