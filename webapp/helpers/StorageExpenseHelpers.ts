/**
 * Despesas do romaneio em % e por saca (GAC-1197). A Yokotobi confere o romaneio contra a tabela
 * de despesas dela, que está em % de desconto e em R$ por saca — o sistema grava kg e R$ totais.
 *
 * Os textos entram como `description` do Input, depois da unidade ("KG · 2,82%", "R$ · 1,40/SC").
 * São só leitura e nunca gravados: a base é sempre o PESO BRUTO, a mesma que a confirmação do
 * romaneio usa para calcular descontos e serviços (`StorageTransactionsConfirmedService`).
 */

/** Peso da saca de referência. Os pesos do sistema estão sempre em KG. */
const KG_PER_BAG = 60;

const SEPARATOR = " · ";

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks está desligado no tsconfig, mas a assinatura documenta o contrato real.
type Numeric = number | string | null | undefined;

// Edm.Decimal pode chegar do OData v4 como texto; campo recém-criado chega vazio.
function toNumber(value: Numeric): number {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? num : 0;
}

function format(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function join(prefix: string, text: string): string {
  return [prefix, text].filter(Boolean).join(SEPARATOR);
}

/** Desconto em kg como % do peso bruto. Sem peso bruto, só a unidade. */
export function discountDescription(unit: string, discountKg: Numeric, grossWeightKg: Numeric): string {
  const gross = toNumber(grossWeightKg);
  if (gross <= 0) {
    return unit || "";
  }
  return join(unit, `${format(toNumber(discountKg) / gross * 100)}%`);
}

/** Valor em R$ dividido pelas sacas de 60 kg do peso bruto. Sem peso bruto, só a moeda. */
export function pricePerBagDescription(currency: string, price: Numeric, grossWeightKg: Numeric): string {
  const gross = toNumber(grossWeightKg);
  if (gross <= 0) {
    return currency || "";
  }
  return join(currency, `${format(toNumber(price) / (gross / KG_PER_BAG))}/SC`);
}
