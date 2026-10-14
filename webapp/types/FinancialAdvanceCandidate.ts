/**
 * Linha da function FinancialDocumentsGetAdvanceCandidates (spec 2026-10-14). PascalCase; valores Edm.Decimal podem
 * chegar como string — sempre Number() antes de comparar ou sugerir.
 */
export type FinancialAdvanceCandidate = {
  DocumentKey: string;
  Code: string;
  DocumentDate: string;
  SettledAmount: number | string;
  AppliedAmount: number | string;
  AvailableAdvanceAmount: number | string;
  SuggestedAmount: number | string;
};
