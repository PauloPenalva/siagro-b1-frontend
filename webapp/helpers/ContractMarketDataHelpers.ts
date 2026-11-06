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
export type ContractMarketDataPayload = {
  instrumentCode: string;
  exchangePrice: number;
  premium: number;
  usdPricePerKg: number;
  fxRate: number;
};

export type ContractMarketDataResult = {
  payload?: ContractMarketDataPayload;
  /** Campo do formulário recusado e o motivo. */
  field?: keyof ContractMarketDataForm;
  error?: "invalid" | "ambiguous" | "notPositive";
};

/** Preenche o formulário a partir do contrato (US$ por kg → por saca). */
export function contractMarketDataToForm(contract: {
  MarketInstrumentCode?: unknown; MarketExchangePrice?: unknown; MarketPremium?: unknown; MarketUsdPrice?: unknown; MarketFxRate?: unknown;
}): ContractMarketDataForm {
  return {
    instrumentCode: typeof contract.MarketInstrumentCode === "string" ? contract.MarketInstrumentCode : "",
    exchangePrice: formatFixedDecimal(contract.MarketExchangePrice, PRICE_DECIMALS),
    premium: formatFixedDecimal(contract.MarketPremium, PRICE_DECIMALS),
    usdPerBag: formatFixedDecimal(usdPerKgToBag(contract.MarketUsdPrice), RATE_DECIMALS),
    fxRate: formatFixedDecimal(contract.MarketFxRate, RATE_DECIMALS),
  };
}

/**
 * Valida e monta o corpo do PUT. Vazio = nulo. Cotação, US$ e dólar, quando informados, > 0 (o prêmio
 * pode ser negativo) — a mesma regra do servidor, só para avisar antes. US$/saca ÷ 60 com 8 casas.
 */
export function buildContractMarketDataPayload(form: ContractMarketDataForm): ContractMarketDataResult {
  const numbers: Partial<Record<keyof ContractMarketDataForm, number>> = {};
  for (const field of ["exchangePrice", "premium", "usdPerBag", "fxRate"] as const) {
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
      usdPricePerKg: usdPerBagToKg(numbers.usdPerBag),
      fxRate: numbers.fxRate,
    },
  };
}
