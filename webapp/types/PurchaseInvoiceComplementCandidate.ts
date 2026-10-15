/**
 * Linha da function PurchaseInvoicesGetComplementCandidates (spec 2026-10-14): um item de entrada própria autorizada do
 * fornecedor e da filial do cabeçalho. PascalCase; Quantity/UnitPrice/Total vêm em double, mas passe por Number() antes de
 * somar. LineNumber (nItem) e as chaves podem vir nulos (strictNullChecks desligado: o tipo já admite).
 */
export type PurchaseInvoiceComplementCandidate = {
  ItemKey: string;
  InvoiceKey: string;
  InvoiceNumber: string;
  InvoiceDate: string;
  AccessKey: string;
  LineNumber: number;
  ItemCode: string;
  ItemName: string;
  UnitOfMeasure: string;
  Quantity: number | string;
  UnitPrice: number | string;
  Total: number | string;
  UsageCode: number;
  UsageName: string;
  PurchaseContractKey: string;
  PurchaseContractCode: string;
};
