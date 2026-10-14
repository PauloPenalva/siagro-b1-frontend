/**
 * Respostas do Web OData: PascalCase, enums como string (spec 2026-10-13). FiscalReconciledAt/By, QuantityKg e
 * AvailableQuantity chegam null (sem strictNullChecks o tipo não diz; a tela testa `=== null`).
 */
export type FiscalReconciliationStatus = "WithoutInvoice" | "Partial" | "Reconciled";

export type FiscalReconciliationLink = {
  Key: string;
  PurchaseInvoiceItemKey: string;
  PurchaseInvoiceKey: string;
  StorageTransactionKey: string;
  TaxDocument: string;
  CardCode: string;
  CardName: string;
  IssueDate: string;
  Quantity: number;
  CreatedAt: string;
  CreatedBy: string;
  /** Título firme/devolução do vínculo (spec 2026-10-13, títulos firmes); null quando a linha não gera financeiro. */
  FirmDocumentKey: string;
  FirmDocumentCode: string;
  /** "Solto" | "Composto" | "Cancelado". */
  FirmSituation: string;
};

export type FiscalReconciliationTransaction = {
  Key: string;
  Code: string;
  TransactionDate: string;
  TransactionType: string;
  TransactionTypeName: string;
  TruckCode: string;
  UnitOfMeasureCode: string;
  ContractCodesText: string;
  PhysicalQuantity: number;
  FiscalQuantity: number;
  Difference: number;
  Status: FiscalReconciliationStatus;
  StatusName: string;
  FiscalReconciledAt: string;
  FiscalReconciledBy: string;
  Links: FiscalReconciliationLink[];
  InvoiceNumbersText: string;
};

export type FiscalReconciliationInvoiceLine = {
  PurchaseInvoiceItemKey: string;
  PurchaseInvoiceKey: string;
  InvoiceType: "Normal" | "Return";
  TaxDocument: string;
  IssueDate: string;
  CardCode: string;
  CardName: string;
  IssuerMatchesSupplier: boolean;
  UsageName: string;
  ContractCode: string;
  UnitOfMeasureCode: string;
  Quantity: number;
  QuantityKg: number;
  LinkedQuantity: number;
  AvailableQuantity: number;
};

export type FiscalReconciliationPair = {
  PurchaseInvoiceItemKey: string;
  StorageTransactionKey: string;
  TaxDocument: string;
  TransactionCode: string;
  CurrentQuantity: number;
  Quantity: number;
};
