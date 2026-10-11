/* eslint-disable @typescript-eslint/no-redundant-type-constituents -- strictNullChecks está desligado no projeto; "| null" documenta o contrato do servidor */
/** Regras puras da remessa para depósito (spec backend 2026-10-10 §5). */

export type StorageRemittanceSummary = {
  RemittanceKey: string | null; RemittanceNumber: string | null; RemittanceStatus: string | null;
  RemittanceNfeStatus: string | null; RemittedQuantity: number; ReturnedQuantity: number;
  PendingReturnQuantity: number; ShippedWithoutReturnQuantity: number;
  Returns: { PurchaseInvoiceKey: string; Number: string | null; InvoiceDate: string | null; Quantity: number; InvoiceStatus: string }[];
  Transactions: { Key: string; Code: string | null; TransactionDate: string | null; TruckCode: string | null; NetWeight: number; ReturnPurchaseInvoiceKey: string | null; ReturnNumber: string | null }[];
};

export function canIssueRemittance(
  releaseStatus: string | undefined, summary: StorageRemittanceSummary | undefined, isStandalone: boolean): boolean {
  return isStandalone && !!summary && !summary.RemittanceKey && !!releaseStatus && releaseStatus !== "Cancelled";
}

export function reconciliationDifference(invoiceQuantity: number, selectedWeights: number[]): { selected: number; difference: number } {
  const selected = selectedWeights.reduce((sum, w) => sum + w, 0);
  return { selected, difference: invoiceQuantity - selected };
}

/** Aceita número ou texto pt-BR ("2,5"); o servidor recusa ≤ 0 de novo. */
export function isRemittancePriceValid(value: unknown): boolean {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value : "";
  const n = typeof value === "number" ? value : Number(text.replace(/\./g, "").replace(",", "."));
  return text.trim() !== "" && Number.isFinite(n) && n > 0;
}
