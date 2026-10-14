/** Linha da function FinancialDocumentsGetByContract (PascalCase; Edm.Decimal pode chegar string). */
export type FinancialDocumentByContract = {
  Key: string;
  Code: string;
  Nature: string;
  Status: string;
  DueDate: string;
  NetAmount: number | string;
  SettledAmount: number | string;
  OpenAmount: number | string;
  ComposedAmount: number | string;
  AppliedAmount: number | string;
  AvailableAdvanceAmount: number | string;
  StorageTransactionCode: string;
  TaxDocumentNumber: string;
};
