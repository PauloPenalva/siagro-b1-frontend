import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataCollection, sendJson } from "siagrob1/helpers/FetchHelpers";

/** Código do catálogo (StandardPostingCatalogGet): contexto, fontes e marcadores permitidos. */
export type CatalogEntry = {
  Code: string;
  Description: string;
  Context: string;
  PerLine: boolean;
  Batch: string;
  Reverses?: string;
  Help: string;
  AccountSources: string[];
  ValueSources: string[];
  Placeholders: string[];
};

export type PostingLine = {
  Sequence: string;
  EntryType: "Double" | "Debit" | "Credit";
  DebitAccountSource?: string;
  DebitAccountCode?: string;
  CreditAccountSource?: string;
  CreditAccountCode?: string;
  ValueSource: string;
  HistoryTemplate: string;
  DebitCostCenterSource: string;
  DebitCostCenterCode?: string;
  CreditCostCenterSource: string;
  CreditCostCenterCode?: string;
  DebitItemSource: string;
  DebitItemCode?: string;
  CreditItemSource: string;
  CreditItemCode?: string;
  Active: boolean;
};

export type StandardPosting = { Code: string; Active: boolean; UpdatedAt?: string; UpdatedBy?: string; Lines: PostingLine[] };

export const CONTEXT_TEXT: Record<string, string> = {
  PurchaseInvoice: "Documento de Entrada",
  SalesInvoice: "Documento de Saída",
  FinancialDocument: "Título",
  Settlement: "Baixa",
  AccountEntry: "Lançamento na conta",
  Transfer: "Transferência",
  CostOfSales: "CMV (fechamento do estoque)",
};

/** Rótulo das fontes de conta/valor do catálogo. */
export const SOURCE_TEXT: Record<string, string> = {
  Fixed: "Conta fixa",
  "Line.LedgerAccount": "Conta da linha",
  "Item.LedgerAccount": "Conta do produto",
  "Partner.LedgerAccount": "Conta do parceiro",
  "Document.LedgerAccount": "Conta do documento",
  "FinancialAccount.LedgerAccount": "Conta da conta financeira",
  "TargetFinancialAccount.LedgerAccount": "Conta da conta de destino",
  "RelatedDocument.LedgerAccount": "Conta do título relacionado",
  "Line.Total": "Total da linha",
  "Line.GrandTotal": "Total geral da linha",
  "Line.NetTotal": "Total líquido da linha",
  "Line.FiscalStockCost": "Custo do estoque fiscal (total − ICMS)",
  "Line.IcmsValue": "ICMS da linha",
  "Line.PisValue": "PIS da linha",
  "Line.CofinsValue": "COFINS da linha",
  "Line.FunruralValue": "Funrural da linha",
  "Line.FreightValue": "Frete da linha",
  "Line.DiscountValue": "Desconto da linha",
  "Line.OtherExpensesValue": "Outras despesas da linha",
  "Document.GrandTotal": "Total geral do documento",
  "Document.NetPayable": "Líquido a pagar",
  "Document.TotalFunrural": "Funrural do documento",
  "Document.WithheldIss": "ISS retido",
  "Document.WithheldIrrf": "IRRF retido",
  "Document.WithheldInss": "INSS retido",
  "Document.WithheldPis": "PIS retido",
  "Document.WithheldCofins": "COFINS retido",
  "Document.WithheldCsll": "CSLL retida",
  "Document.CteIcmsValue": "ICMS do CT-e",
  "Document.NetAmount": "Valor do título",
  "Settlement.Amount": "Valor da baixa",
  "Settlement.InterestAmount": "Juros",
  "Settlement.FineAmount": "Multa",
  "Settlement.DiscountAmount": "Desconto",
  "Entry.Amount": "Valor do lançamento",
  "Transfer.Amount": "Valor da transferência",
  "Item.CostOfSales": "CMV do produto no mês",
};

export function sourceText(source: string): string {
  return SOURCE_TEXT[source] ?? source ?? "";
}

export async function loadCatalog(): Promise<CatalogEntry[]> {
  const result = await sendJson("GET", ServerRoutes.standardPostingCatalog);
  if (!result.ok) throw new Error(result.message);
  return odataCollection<CatalogEntry>(result.data);
}

export async function loadConfigured(): Promise<StandardPosting[]> {
  const result = await sendJson("GET", `${ServerRoutes.standardPostings}?$expand=Lines`);
  if (!result.ok) throw new Error(result.message);
  return odataCollection<StandardPosting>(result.data);
}
