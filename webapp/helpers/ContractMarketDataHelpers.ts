import { parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import { usdPerBagToKg, usdPerKgToBag } from "siagrob1/helpers/MarketSetupHelpers";

/** Casas fixas dos números da seção Mercado do contrato (cotação/prêmio em 2, US$/saca e dólar em 4). */
export const PRICE_DECIMALS = 2;
export const RATE_DECIMALS = 4;

/** Número pt-BR sem milhar e com casas fixas ("1190,00"): reler com `parseStrictDecimal` nunca é ambíguo. */
export function formatFixedDecimal(value: unknown, decimals: number): string {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return number.toLocaleString("pt-BR", { useGrouping: false, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Formulário do diálogo "Alterar dados de mercado" (textos como digitados; US$ por saca). */
export type ContractMarketDataForm = {
  instrumentCode: string;
  exchangePrice: string;
  premium: string;
  usdPerBag: string;
  fxRate: string;
};

/** Corpo de `PUT market/contracts/{purchase|sales}/{key}/market-data` (nulo limpa o campo). */
// Nulo limpa o campo (contrato do PUT); declarado explícito mesmo sem strictNullChecks.
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
export type ContractMarketDataPayload = {
  instrumentCode: string | null;
  exchangePrice: number | null;
  premium: number | null;
  usdPricePerKg: number | null;
  fxRate: number | null;
};
/* eslint-enable @typescript-eslint/no-redundant-type-constituents */

/** Números do contrato como vieram (sem o arredondamento da tela) e o texto inicial de cada campo. */
export type ContractMarketDataInitial = {
  form: ContractMarketDataForm;
  values: Record<"exchangePrice" | "premium" | "usdPerBag" | "fxRate", number>;
};

type ContractMarketDataSource = {
  MarketInstrumentCode?: unknown; MarketExchangePrice?: unknown; MarketPremium?: unknown; MarketUsdPrice?: unknown; MarketFxRate?: unknown;
};

function toNumberOrNull(value: unknown): number {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Arredonda para as casas mostradas (meio para longe do zero, como o texto): a tela nunca guarda mais precisão do que mostra. */
export function roundToDecimals(value: number, decimals: number): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(decimals));
}

type InstrumentOption = { Code: string; Label: string };

/** Itens do Select de um contrato: os ativos + o código atual dele (se hoje inativo). Nunca altera `active`. */
export function instrumentOptionsFor<T extends InstrumentOption>(active: T[], code: unknown): InstrumentOption[] {
  if (typeof code !== "string" || !code || active.some((option) => option.Code === code)) return active;
  return [...active, { Code: code, Label: code }];
}

export type ContractMarketDataResult = {
  payload?: ContractMarketDataPayload;
  /** Campo do formulário recusado e o motivo. */
  field?: keyof ContractMarketDataForm;
  error?: "invalid" | "ambiguous" | "notPositive";
};

/** Preenche o formulário a partir do contrato (US$ por kg → por saca). */
export function contractMarketDataToForm(contract: ContractMarketDataSource): ContractMarketDataForm {
  return {
    instrumentCode: typeof contract.MarketInstrumentCode === "string" ? contract.MarketInstrumentCode : "",
    exchangePrice: formatFixedDecimal(contract.MarketExchangePrice, PRICE_DECIMALS),
    premium: formatFixedDecimal(contract.MarketPremium, PRICE_DECIMALS),
    usdPerBag: formatFixedDecimal(usdPerKgToBag(contract.MarketUsdPrice), RATE_DECIMALS),
    fxRate: formatFixedDecimal(contract.MarketFxRate, RATE_DECIMALS),
  };
}

/** Guarda, ao abrir o diálogo, o texto inicial e o número original de cada campo. US$ guardado por kg. */
export function contractMarketDataInitial(contract: ContractMarketDataSource): ContractMarketDataInitial {
  return {
    form: contractMarketDataToForm(contract),
    values: {
      exchangePrice: toNumberOrNull(contract.MarketExchangePrice),
      premium: toNumberOrNull(contract.MarketPremium),
      usdPerBag: toNumberOrNull(contract.MarketUsdPrice),
      fxRate: toNumberOrNull(contract.MarketFxRate),
    },
  };
}

/**
 * Valida e monta o corpo do PUT. Vazio = nulo. Cotação, US$ e dólar, quando informados, > 0 (o prêmio
 * pode ser negativo) — a mesma regra do servidor, só para avisar antes. US$/saca ÷ 60 com 8 casas.
 * Com `initial`: campo cujo texto não mudou vai com o número ORIGINAL exato (o texto é arredondado
 * para a tela; devolvê-lo mudaria o campo em silêncio e geraria linha no log de alterações).
 */
export function buildContractMarketDataPayload(form: ContractMarketDataForm, initial?: ContractMarketDataInitial): ContractMarketDataResult {
  const numbers: Partial<Record<keyof ContractMarketDataForm, number>> = {};
  /** `undefined` = US$ editado (usar o digitado); número ou nulo = original. */
  let originalUsdPerKg: number;
  for (const field of ["exchangePrice", "premium", "usdPerBag", "fxRate"] as const) {
    if (initial && form[field] === initial.form[field]) {
      if (field === "usdPerBag") originalUsdPerKg = initial.values.usdPerBag;
      else numbers[field] = initial.values[field];
      continue;
    }
    const { value, error } = parseStrictDecimal(form[field]);
    if (error) return { field, error };
    if (field !== "premium" && value !== null && value <= 0) return { field, error: "notPositive" };
    numbers[field] = value;
  }
  return {
    payload: {
      instrumentCode: form.instrumentCode ? form.instrumentCode : null,
      exchangePrice: numbers.exchangePrice,
      premium: numbers.premium,
      usdPricePerKg: originalUsdPerKg !== undefined ? originalUsdPerKg : usdPerBagToKg(numbers.usdPerBag),
      fxRate: numbers.fxRate,
    },
  };
}
