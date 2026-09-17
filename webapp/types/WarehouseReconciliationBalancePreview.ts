/** Liberação do armazém+produto com o saldo a embarcar na data e hoje (GAC-1164 §9). */
export type WarehouseReconciliationReleaseBalance = {
  shipmentReleaseKey: string;
  releaseDate: string;
  status: string;
  origin: string;
  purchaseContractCode: string;
  cardName: string;
  balanceAtReferenceDate: number;
  currentBalance: number;
  canReceiveLoss: boolean;
};

/** Linha gravada da distribuição da perda, com os romaneios gerados na aprovação. */
export type WarehouseReconciliationReleaseLine = {
  shipmentReleaseKey: string;
  releaseDate: string;
  purchaseContractCode: string;
  cardCode: string;
  cardName: string;
  quantity: number;
  purchaseTransactionCode: string;
  lossTransactionCode: string;
};

/** Prévia de saldo da Conferência de Saldo de Armazém. */
export type WarehouseReconciliationBalancePreview = {
  systemBalance: number;
  isOwnWarehouse: boolean;
  // O eslint reclama que `| null` é redundante: este projeto roda com `strictNullChecks: false`,
  // então null já é atribuível a qualquer tipo. Mantemos a anotação porque documenta o contrato
  // real (nunca houve conferência aprovada) — mesmo padrão de
  // FinancialDocumentsBaseController.direction/natureFilter.
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  lastApprovedReferenceDate: string | null;
  hasOpenReconciliation: boolean;
  releases: WarehouseReconciliationReleaseBalance[];
};

type Raw = Record<string, unknown>;

const picker = (o: Raw) => (camel: string, pascal: string) => o[camel] ?? o[pascal];

/** Function devolve o array cru ou `{ value: [...] }`. */
function rowsOf(raw: unknown): Raw[] {
  if (Array.isArray(raw)) return raw as Raw[];
  const o = (raw ?? {}) as Raw;
  return ((o.value ?? o.Value ?? []) as Raw[]);
}

function normalizeReleaseBalance(o: Raw): WarehouseReconciliationReleaseBalance {
  const pick = picker(o);
  return {
    shipmentReleaseKey: pick("shipmentReleaseKey", "ShipmentReleaseKey") as string,
    releaseDate: pick("releaseDate", "ReleaseDate") as string,
    status: pick("status", "Status") as string,
    origin: pick("origin", "Origin") as string,
    purchaseContractCode: pick("purchaseContractCode", "PurchaseContractCode") as string,
    cardName: pick("cardName", "CardName") as string,
    balanceAtReferenceDate: Number(pick("balanceAtReferenceDate", "BalanceAtReferenceDate") ?? 0),
    currentBalance: Number(pick("currentBalance", "CurrentBalance") ?? 0),
    canReceiveLoss: Boolean(pick("canReceiveLoss", "CanReceiveLoss")),
  };
}

/**
 * A function OData devolve o DTO sem envelope e a caixa das chaves depende do serializador
 * (as respostas REST deste backend saem em camelCase). Lê as duas formas para não falhar
 * em silêncio com `undefined`.
 */
export function normalizeBalancePreview(raw: unknown): WarehouseReconciliationBalancePreview {
  const o = (raw ?? {}) as Raw;
  const pick = picker(o);

  return {
    systemBalance: Number(pick("systemBalance", "SystemBalance") ?? 0),
    isOwnWarehouse: Boolean(pick("isOwnWarehouse", "IsOwnWarehouse")),
    lastApprovedReferenceDate: (pick("lastApprovedReferenceDate", "LastApprovedReferenceDate") as string) ?? null,
    hasOpenReconciliation: Boolean(pick("hasOpenReconciliation", "HasOpenReconciliation")),
    releases: rowsOf(pick("releases", "Releases")).map(normalizeReleaseBalance),
  };
}

export function normalizeReleaseLines(raw: unknown): WarehouseReconciliationReleaseLine[] {
  return rowsOf(raw).map((o) => {
    const pick = picker(o);
    return {
      shipmentReleaseKey: pick("shipmentReleaseKey", "ShipmentReleaseKey") as string,
      releaseDate: pick("releaseDate", "ReleaseDate") as string,
      purchaseContractCode: pick("purchaseContractCode", "PurchaseContractCode") as string,
      cardCode: pick("cardCode", "CardCode") as string,
      cardName: pick("cardName", "CardName") as string,
      quantity: Number(pick("quantity", "Quantity") ?? 0),
      purchaseTransactionCode: pick("purchaseTransactionCode", "PurchaseTransactionCode") as string,
      lossTransactionCode: pick("lossTransactionCode", "LossTransactionCode") as string,
    };
  });
}
