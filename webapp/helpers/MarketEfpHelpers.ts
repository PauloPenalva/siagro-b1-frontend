import { EMPTY_VALUE } from "siagrob1/helpers/MarketHelpers";
import { fixed, toCamel, toNumber, toPascal } from "siagrob1/helpers/MarketHedgeHelpers";
import { numberErrorKey, parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import { MarketEfpPayload } from "siagrob1/types/MarketHedges";

/**
 * Funções puras da tela de EFP (troca de futuro por físico). Devolvem CHAVES de i18n quando precisam de texto.
 * O servidor é quem decide; as regras daqui só evitam pedir o que ele vai recusar.
 */

/** Saca de 60 kg: o contrato a fixar é em kg e a tela fala em sacas. */
export const BAG_KG = 60;

/** Diferença entre toneladas da bolsa e do físico acima da qual a tela avisa (5 %). */
export const TONS_MISMATCH_LIMIT = 0.05;

export type ContractSide = "purchase" | "sales";

// ---------------------------------------------------------------------------------------------
// Conversões e formatação
// ---------------------------------------------------------------------------------------------

export function bagsToKg(bags: number): number {
  return bags === null ? null : Math.round(bags * BAG_KG * 1000) / 1000;
}

export function kgToBags(kg: unknown): number {
  const n = toNumber(kg);
  return n === null ? null : n / BAG_KG;
}

/** Sacas da grade: o volume em kg dividido por 60, 2 casas; ausente vira "–". */
export function formatBags(kg: unknown): string {
  const bags = kgToBags(kg);
  return bags === null ? EMPTY_VALUE : fixed(bags, 2, 2);
}

/** Preço da fixação por saca a partir do preço por kg (`FixationPrice × 60`), 2 casas. */
export function formatFixationPerBag(pricePerKg: unknown): string {
  const n = toNumber(pricePerKg);
  return n === null ? EMPTY_VALUE : fixed(n * BAG_KG, 2, 2);
}

/** Preço por kg com 4 a 8 casas (o servidor arredonda a 8). */
export function formatPerKg(value: unknown): string {
  const n = toNumber(value);
  return n === null ? EMPTY_VALUE : fixed(n, 4, 8);
}

/** Valor por saca com moeda: "R$ 112,50" / "US$ 20,00". */
export function formatBagPrice(value: unknown, currency: string): string {
  const n = toNumber(value);
  if (n === null) return EMPTY_VALUE;
  const key = normalizeCurrency(currency);
  const symbol = key === "brl" ? "R$ " : key === "usd" ? "US$ " : "";
  return `${symbol}${fixed(n, 2, 2)}`;
}

/** Aceita "BRL"/"R$"/"brl" e "USD"/"US$"/"usd"; qualquer outra coisa é vazio. */
export function normalizeCurrency(currency: string): "brl" | "usd" | "" {
  const key = (currency ?? "").trim().toLowerCase().replace(/\s/g, "");
  if (key === "brl" || key === "r$" || key === "real") return "brl";
  return key === "usd" || key === "us$" || key === "dolar" ? "usd" : "";
}

/** Moeda do contrato para exibir: "R$" / "US$"; moeda desconhecida aparece como veio, em maiúsculas; ausente = vazio. */
export function currencySymbol(currency: string): string {
  const key = normalizeCurrency(currency);
  if (key === "brl") return "R$";
  return key === "usd" ? "US$" : (currency ?? "").trim().toUpperCase();
}

export function efpStatusTextKey(status: string): string {
  const key = toCamel(status ?? "");
  return ["processing", "active", "canceled"].includes(key) ? `marketEfpStatus_${key}` : "marketEfpStatus_unknown";
}

/** Processando = atenção (precisa de "Retomar"); ativo = sucesso; estornado = neutro. */
export function efpStatusState(status: string): "Warning" | "Success" | "None" {
  const key = toCamel(status ?? "");
  if (key === "processing") return "Warning";
  return key === "active" ? "Success" : "None";
}

export function efpContractSideTextKey(side: string): string {
  const key = toCamel(side ?? "");
  return key === "purchase" || key === "sales" ? `marketEfpContractSide_${key}` : "marketEfpContractSide_unknown";
}

// ---------------------------------------------------------------------------------------------
// Regras do formulário
// ---------------------------------------------------------------------------------------------

/** Lado padrão da perna de bolsa: contrato de compra trava preço vendendo; contrato de venda, comprando. */
export function defaultFuturesSide(contractSide: string): "buy" | "sell" {
  return toCamel(contractSide ?? "") === "sales" ? "buy" : "sell";
}

/** Instrumento cotado em US$ (US¢/bu ou US$/t). */
export function isUsdQuote(quoteUnit: string): boolean {
  const unit = toPascal(quoteUnit ?? "");
  return unit === "UsCentsPerBushel" || unit === "UsdPerTon";
}

/**
 * Câmbio no EFP: `required` = instrumento em US$ com contrato em R$ (digitar); `none` = campo desligado
 * (câmbio 1 ou nem se aplica); `refused` = instrumento em R$ com contrato em US$ (o servidor recusa).
 * Sem instrumento ou sem moeda do contrato ainda não há regra: `none`.
 */
export function fxMode(quoteUnit: string, contractCurrency: string): "required" | "none" | "refused" {
  const currency = normalizeCurrency(contractCurrency);
  if (!quoteUnit || !currency) return "none";
  const usdInstrument = isUsdQuote(quoteUnit);
  if (usdInstrument && currency === "brl") return "required";
  return !usdInstrument && currency === "usd" ? "refused" : "none";
}

/** O volume digitado (sacas) passa do saldo a fixar do contrato (kg)? Tolerância de 0,0005 kg. */
export function exceedsAvailable(bags: number, availableKg: unknown): boolean {
  const available = toNumber(availableKg);
  if (bags === null || available === null) return false;
  return bagsToKg(bags) - available > 0.0005;
}

/** Toneladas da bolsa e do físico divergem mais de 5 %? (comparação em módulo; só aviso, nunca erro) */
export function tonsMismatch(tonsFutures: unknown, tonsPhysical: unknown): boolean {
  const futures = toNumber(tonsFutures), physical = toNumber(tonsPhysical);
  if (futures === null || physical === null || physical === 0) return false;
  return Math.abs(Math.abs(futures) - Math.abs(physical)) / Math.abs(physical) > TONS_MISMATCH_LIMIT + 1e-9;
}

// ---------------------------------------------------------------------------------------------
// Ações da linha
// ---------------------------------------------------------------------------------------------

export type EfpActions = { canResume: boolean; canCancel: boolean; hasContract: boolean };

/** "Retomar" só em processando; "Estornar" em ativo ou processando; sem permissão nada é habilitado. */
export function efpActions(efp: { Status?: string; ContractKey?: string }, canManage: boolean): EfpActions {
  const none: EfpActions = { canResume: false, canCancel: false, hasContract: false };
  if (!efp) return none;
  const status = toCamel(efp.Status ?? "");
  return {
    canResume: canManage && status === "processing",
    canCancel: canManage && (status === "processing" || status === "active"),
    hasContract: !!efp.ContractKey,
  };
}

/** Rota do detalhe do contrato conforme o lado. */
export function contractRouteName(contractSide: string): string {
  return toCamel(contractSide ?? "") === "sales" ? "salesContractsDetail" : "purchaseContractsDetail";
}

// ---------------------------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------------------------

/** Estado do diálogo (números como o texto digitado, enums em camelCase, datas `yyyy-MM-dd`). */
export type EfpForm = {
  date: string;
  contractSide: string;
  contractKey: string;
  accountId: string;
  instrumentCode: string;
  side: string;
  lots: string;
  price: string;
  premium: string;
  fxRate: string;
  /** Volume em sacas. */
  bags: string;
  financialDueDate: string;
  notes: string;
};

export type EfpField =
  "contractKey" | "bags" | "accountId" | "instrumentCode" | "side" | "lots" | "price" | "premium" | "fxRate" | "financialDueDate" | "date";

/** Erro por campo = chave de i18n. */
export type EfpFormErrors = Partial<Record<EfpField, string>>;

export type EfpContext = {
  /** Unidade de cotação do instrumento escolhido (OData PascalCase). */
  quoteUnit: string;
  contractCurrency: string;
  availableToPriceKg: unknown;
};

/**
 * Campos do formulário que alimentam o cálculo do EFP: mudar qualquer um invalida o resultado já mostrado.
 * Observações não entram: não mudam o preço, e editá-las não deve exigir "Calcular" de novo.
 */
export const EFP_PREVIEW_FIELDS: readonly string[] = [
  "date", "contractSide", "contractKey", "accountId", "instrumentCode", "side", "lots", "price", "premium", "fxRate", "bags",
  "financialDueDate",
];

/** O caminho do modelo (`/price`, `price`) é de um campo que invalida o resultado calculado? */
export function invalidatesPreview(path: string): boolean {
  const name = (path ?? "").split("/").pop();
  return EFP_PREVIEW_FIELDS.includes(name);
}

/** Assinatura dos valores de entrada: o resultado só vale se a assinatura de hoje for a de quando foi calculado. */
export function efpInputSignature(form: Partial<EfpForm>): string {
  return JSON.stringify(EFP_PREVIEW_FIELDS.map((field) => (form as Record<string, unknown>)?.[field] ?? ""));
}

const blankToNull = (value: string): string => (value ?? "").trim() || null;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida e monta o corpo do preview/gravação. Números digitados passam por `parseStrictDecimal` (recusa "1.500");
 * prêmio vazio = 0; câmbio só segue (e só é exigido) quando `fxMode` é `required`.
 */
export function buildEfpPayload(form: EfpForm, context: EfpContext): { payload?: MarketEfpPayload; errors: EfpFormErrors } {
  const errors: EfpFormErrors = {};
  if (!form.contractKey) errors.contractKey = "marketEfpContractRequired";
  if (!form.accountId) errors.accountId = "marketRequiredField";
  if (!form.instrumentCode) errors.instrumentCode = "marketRequiredField";
  if (!form.side) errors.side = "marketRequiredField";
  if (!ISO_DATE.test(form.date ?? "")) errors.date = "marketRequiredField";
  if (!ISO_DATE.test(form.financialDueDate ?? "")) errors.financialDueDate = "marketEfpDueDateRequired";

  const bags = parseStrictDecimal(form.bags);
  if (bags.error) errors.bags = numberErrorKey(bags.error);
  else if (!(bags.value > 0)) errors.bags = "marketEfpBagsInvalid";
  else if (exceedsAvailable(bags.value, context.availableToPriceKg)) errors.bags = "marketEfpBagsExceed";

  const lots = /^\d+$/.test((form.lots ?? "").trim()) ? Number(form.lots.trim()) : 0;
  if (!(lots > 0) || !Number.isSafeInteger(lots)) errors.lots = "marketFuturesLotsInvalid";

  const price = parseStrictDecimal(form.price);
  if (price.error) errors.price = numberErrorKey(price.error);
  else if (!(price.value > 0)) errors.price = "marketFuturesPriceInvalid";

  const premium = parseStrictDecimal(form.premium);
  if (premium.error) errors.premium = numberErrorKey(premium.error);

  const mode = fxMode(context.quoteUnit, context.contractCurrency);
  if (mode === "refused") errors.instrumentCode = "marketEfpFxRefused";
  let fxRate: number = null;
  if (mode === "required") {
    const fx = parseStrictDecimal(form.fxRate);
    if (fx.error) errors.fxRate = numberErrorKey(fx.error);
    else if (!(fx.value > 0)) errors.fxRate = "marketEfpFxRequired";
    else fxRate = fx.value;
  }

  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    payload: {
      date: form.date,
      accountId: Number(form.accountId),
      instrumentCode: form.instrumentCode,
      side: form.side,
      lots,
      price: price.value,
      premium: premium.value ?? 0,
      fxRate,
      contractSide: form.contractSide,
      contractKey: form.contractKey,
      volumeKg: bagsToKg(bags.value),
      financialDueDate: form.financialDueDate,
      notes: blankToNull(form.notes),
    },
  };
}
