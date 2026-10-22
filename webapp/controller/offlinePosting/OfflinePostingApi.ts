import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";

export type RunStatus = "Queued" | "Running" | "Completed" | "Failed";
export type ItemResult = "Posted" | "WouldPost" | "Error" | "Skipped";

export type RunItem = {
  Sequence: number;
  EventDate: string;
  DocumentType: string;
  DocumentKey: string;
  DocumentNumber: string;
  BranchCode: string;
  Codes: string;
  Result: ItemResult;
  Message?: string;
  JournalEntryDocEntries?: string;
};

export type Run = {
  Key: string;
  DateFrom: string;
  DateTo: string;
  BranchCode?: string;
  Modules: string;
  Simulation: boolean;
  Status: RunStatus;
  RequestedBy: string;
  RequestedAt: string;
  StartedAt?: string;
  FinishedAt?: string;
  PostedCount: number;
  ErrorCount: number;
  SkippedCount: number;
  FailureMessage?: string;
  Items?: RunItem[];
};

/** Módulos (OfflinePostingModule do backend). */
export const MODULES = { PurchaseInvoices: 1, SalesInvoices: 2, Financial: 3 } as const;

export const MODULE_TEXT: Record<string, string> = { "1": "Entradas", "2": "Saídas", "3": "Financeiro" };

export const DOCUMENT_TYPE_TEXT: Record<string, string> = {
  PurchaseInvoice: "Documento de Entrada",
  SalesInvoice: "Documento de Saída",
  FinancialDocument: "Título",
  FinancialSettlement: "Baixa",
  FinancialAccountEntry: "Lançamento na conta",
  FinancialAccountTransfer: "Transferência",
};

export const STATUS_TEXT: Record<RunStatus, string> = {
  Queued: "Na fila",
  Running: "Em andamento",
  Completed: "Concluída",
  Failed: "Falhou",
};

export const RESULT_TEXT: Record<ItemResult, string> = {
  Posted: "Contabilizado",
  WouldPost: "Contabilizaria",
  Error: "Erro",
  Skipped: "Ignorado",
};

export function isActive(status: RunStatus): boolean {
  return status === "Queued" || status === "Running";
}

export async function loadRuns(): Promise<Run[]> {
  const result = await sendJson("GET", `${ServerRoutes.offlinePostingRuns}?$orderby=RequestedAt desc&$top=20`);
  if (!result.ok) throw new Error(result.message);
  return odataCollection<Run>(result.data);
}

export async function loadRun(key: string): Promise<Run> {
  const result = await sendJson("GET", `${ServerRoutes.offlinePostingRuns}(${key})?$expand=Items($orderby=Sequence)`);
  if (!result.ok) throw new Error(result.message);
  return odataValue<Run>(result.data) ?? (result.data as Run);
}

export async function requestRun(payload: {
  DateFrom: string;
  DateTo: string;
  BranchCode?: string;
  Modules: number[];
  Simulation: boolean;
}): Promise<Run> {
  // Edm.DateTimeOffset: o backend usa o dia no próprio offset, então meia-noite UTC preserva o dia escolhido.
  const result = await sendJson("POST", ServerRoutes.offlinePostingRequest, {
    ...payload,
    DateFrom: `${payload.DateFrom}T00:00:00Z`,
    DateTo: `${payload.DateTo}T00:00:00Z`,
  });
  if (!result.ok) throw new Error(result.message);
  return result.data as Run;
}
