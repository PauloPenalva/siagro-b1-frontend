/**
 * Linha de /odata/PurchaseDischargesList (PascalCase explícito no DTO do backend).
 *
 * O eslint reclama que `| null` é redundante: este projeto roda com `strictNullChecks: false`,
 * então null já é atribuível a qualquer tipo. Mantemos a anotação porque documenta o contrato
 * real (mesmo padrão de WarehouseReconciliationBalancePreview.lastApprovedReferenceDate).
 */
export type PurchaseDischarge = {
  Key: string;
  Code: string;
  TransactionType: "PurchaseDischargeLoss" | "PurchaseDischargeGain";
  Status: string;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  TransactionDate: string | null;
  SupplierCode: string;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  SupplierName: string | null;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  PurchaseContractKey: string | null;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  PurchaseContractCode: string | null;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  ShipmentLoadCode: string | null;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  SalesInvoiceNumber: string | null;
  Volume: number;
  UnitOfMeasureCode: string;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  CreatedBy: string | null;
};
