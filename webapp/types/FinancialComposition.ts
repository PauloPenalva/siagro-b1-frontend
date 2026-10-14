/**
 * Function FinancialDocumentsGetComposition (spec 2026-10-13, títulos firmes). PascalCase; valores Edm.Decimal podem
 * chegar como string — sempre Number() antes de comparar.
 */
export type FinancialCompositionLine = {
  CompositionKey: string;
  ProvisionalDocumentKey: string;
  ProvisionalCode: string;
  DocumentKey: string;
  DocumentCode: string;
  Nature: string;
  StorageTransactionCode: string;
  TaxDocumentNumber: string;
  CardCode: string;
  CardName: string;
  Amount: number | string;
  CreatedAt: string;
  CreatedBy: string;
};

export type FinancialCompositionCandidate = {
  DocumentKey: string;
  Code: string;
  Nature: string;
  StorageTransactionCode: string;
  TaxDocumentNumber: string;
  CardCode: string;
  CardName: string;
  DocumentDate: string;
  OpenAmount: number | string;
  SuggestedAmount: number | string;
  /** Só na tela: marcado no diálogo Compor. */
  selected?: boolean;
};

export type FinancialComposition = {
  Lines: FinancialCompositionLine[];
  Candidates: FinancialCompositionCandidate[];
};
