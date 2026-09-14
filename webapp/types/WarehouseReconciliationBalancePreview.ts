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
};

type RawPreview = Record<string, unknown>;

/**
 * A function OData devolve o DTO sem envelope e a caixa das chaves depende do serializador
 * (as respostas REST deste backend saem em camelCase). Lê as duas formas para não falhar
 * em silêncio com `undefined`.
 */
export function normalizeBalancePreview(raw: unknown): WarehouseReconciliationBalancePreview {
  const o = (raw ?? {}) as RawPreview;
  const pick = (camel: string, pascal: string) => o[camel] ?? o[pascal];

  return {
    systemBalance: Number(pick("systemBalance", "SystemBalance") ?? 0),
    isOwnWarehouse: Boolean(pick("isOwnWarehouse", "IsOwnWarehouse")),
    lastApprovedReferenceDate: (pick("lastApprovedReferenceDate", "LastApprovedReferenceDate") as string) ?? null,
    hasOpenReconciliation: Boolean(pick("hasOpenReconciliation", "HasOpenReconciliation")),
  };
}
