/**
 * Origem de cada entrega na tabela "Entregas do Contrato de Compra" (GAC-1164) e os romaneios de
 * quebra/sobra de descarga da troca nota (tipos 16/17).
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
  {
    key: "DischargeLoss",
    legend: "Quebra de descarga",
    text: "Quebra de descarga",
    highlight: "Error",
    state: "Error",
    icon: "sap-icon://trend-down",
  },
  {
    key: "DischargeGain",
    legend: "Sobra de descarga",
    text: "Sobra de descarga",
    highlight: "Success",
    state: "Success",
    icon: "sap-icon://trend-up",
  },
  {
    // GAC-1214: carga recusada que voltou para um armazém. A devolução tem volume NEGATIVO e devolve
    // o saldo ao contrato; a linha vem de uma alocação (linha negativa do razão do contrato).
    key: "LoadRefusal",
    legend: "Devolução de carga",
    text: "Devolução",
    highlight: "Information",
    state: "Information",
    icon: "sap-icon://undo",
  },
  {
    // GAC-1214: saída pela liberação de devolução (reentrega). Volume positivo: baixa o contrato de novo.
    key: "ReturnRedelivery",
    legend: "Reentrega de devolução",
    text: "Reentrega",
    highlight: "Information",
    state: "Information",
    icon: "sap-icon://redo",
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
  reconciliationCode: string,
  dischargeInvoiceNumber?: string,
  dischargeLoadCode?: string
): string {
  const origin = originOf(key).key;

  if (origin === "WarehouseLoss" && reconciliationCode) {
    return `Conferência de saldo de armazém ${reconciliationCode}`;
  }

  // Troca nota: o romaneio 16/17 nasce da Conferência de Entregas da nota de venda.
  if ((origin === "DischargeLoss" || origin === "DischargeGain") && dischargeInvoiceNumber) {
    return dischargeLoadCode
      ? `Conferência da nota ${dischargeInvoiceNumber} (carga ${dischargeLoadCode})`
      : `Conferência da nota ${dischargeInvoiceNumber}`;
  }

  if (origin === "LoadRefusal") {
    // Devolução por nota (sem carga) chega sem código de carga.
    return dischargeLoadCode
      ? `Carga ${dischargeLoadCode} recusada: a devolução ao armazém devolveu o saldo ao contrato.`
      : "Devolução ao armazém: devolveu o saldo ao contrato.";
  }

  if (origin === "ReturnRedelivery") {
    return "Saída pela liberação de devolução: o contrato foi baixado de novo.";
  }

  return "";
}
