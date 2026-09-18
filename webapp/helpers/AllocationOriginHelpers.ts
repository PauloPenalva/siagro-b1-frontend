/**
 * Origem de cada entrega na tabela "Entregas do Contrato de Compra" (GAC-1164).
 *
 * O Tipo do romaneio continua "Compra" mesmo quando ele nasce da aprovação de uma Conferência de
 * Saldo de Armazém: a perda é custo da Yokotobi e o contrato conta o volume como entregue. A origem
 * só diferencia a linha visualmente. Uma origem nova no backend (campo `Origin` do
 * PurchaseContractsGetAllocationsByContract) entra aqui com uma linha e já aparece na legenda.
 */
export interface AllocationOrigin {
  key: string;
  /** Texto da legenda. */
  legend: string;
  /** Texto da coluna Origem; vazio para não poluir as linhas normais. */
  text: string;
  /** Cor da faixa lateral da linha (sap.ui.core.IndicationColor / MessageType). */
  highlight: string;
  /** ValueState do ObjectStatus da coluna e da legenda. */
  state: string;
  icon: string;
}

export const ALLOCATION_ORIGINS: AllocationOrigin[] = [
  {
    key: "Standard",
    legend: "Normal",
    text: "",
    highlight: "None",
    state: "None",
    icon: "",
  },
  {
    key: "WarehouseLoss",
    legend: "Perda de armazém",
    text: "Perda de armazém",
    highlight: "Warning",
    state: "Warning",
    icon: "sap-icon://warning2",
  },
];

const STANDARD = ALLOCATION_ORIGINS[0];

function originOf(key: string): AllocationOrigin {
  return ALLOCATION_ORIGINS.find((o) => o.key === key) ?? STANDARD;
}

export function allocationOriginHighlight(key: string): string {
  return originOf(key).highlight;
}

export function allocationOriginText(key: string): string {
  return originOf(key).text;
}

export function allocationOriginState(key: string): string {
  return originOf(key).state;
}

export function allocationOriginIcon(key: string): string {
  return originOf(key).icon;
}

export function allocationOriginTooltip(
  key: string,
  reconciliationCode: string
): string {
  if (originOf(key).key === "WarehouseLoss" && reconciliationCode) {
    return `Conferência de saldo de armazém ${reconciliationCode}`;
  }
  return "";
}
