/**
 * Espelho da regra do backend (PurchaseContractWashout.CalculateAmount), só para a prévia do
 * diálogo: round(max(mercado - contrato, 0) x volume fixado, 2) + round(multa, 2). O valor
 * gravado é sempre o calculado no servidor.
 */
export function calculateWashoutAmount(
  marketPrice: number,
  contractPrice: number,
  fixedVolume: number,
  penaltyAmount: number
): number {
  const difference = Math.max(marketPrice - contractPrice, 0) * fixedVolume;
  return roundTo2(difference) + roundTo2(penaltyAmount);
}

export function formatNumberPtBr(value: number, decimals: number): string {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function roundTo2(value: number): number {
  return Math.round((Number(value ?? 0) + Number.EPSILON) * 100) / 100;
}
