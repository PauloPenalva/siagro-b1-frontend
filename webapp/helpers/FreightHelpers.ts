/**
 * Frete/Remoção do romaneio e do ticket de pesagem (GAC-1191). A Mhagro lança o valor da viagem
 * (Fixo); a Yokotobi cobra por saco de 60 kg (Saco).
 *
 * ⚠️ É só a PRÉVIA mostrada enquanto o usuário digita. A regra oficial é a do
 * `FreightPriceCalculator` do backend, que recalcula o `FreightPrice` a cada gravação — mudou a
 * regra, mude os dois.
 */

/** Membros do enum `FreightCalculationMethod` do backend, como o OData os serializa. */
export type FreightCalculationMethod = "Fixed" | "PerBag";

/** Peso do saco de referência. Os pesos do sistema estão sempre em KG. */
const KG_PER_BAG = 60;

// Edm.Decimal pode chegar do OData v4 como texto; campo recém-criado chega vazio.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks está desligado no tsconfig, mas a assinatura documenta o contrato real.
function toNumber(value: number | string | null | undefined): number {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? num : 0;
}

export function calculateFreightPrice(
  method: FreightCalculationMethod,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- idem.
  unitPrice: number | string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- idem.
  grossWeightKg: number | string | null | undefined,
): number {
  const unit = toNumber(unitPrice);

  if (method !== "PerBag") {
    return unit;
  }

  const total = toNumber(grossWeightKg) / KG_PER_BAG * unit;
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function freightUnitDescription(method: FreightCalculationMethod): string {
  return method === "PerBag" ? "por saco (60 kg)" : "por viagem";
}
