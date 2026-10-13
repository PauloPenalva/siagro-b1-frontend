/* eslint-disable @typescript-eslint/no-redundant-type-constituents -- strictNullChecks está desligado no projeto; "| null" documenta o contrato do servidor */
import { isRemittancePriceValid } from "siagrob1/helpers/StorageDepositHelpers";

/** Regras puras das notas de custódia em armazém próprio (spec backend 2026-10-12 §5). */

export type StorageCustodyStep = {
  Role: string; RoleText: string; Situation: string; SituationText: string;
  DocumentKey: string | null; IsSalesInvoice: boolean; InvoiceNumber: string | null; Number: string | null;
  TaxDocumentSeries: string | null; ChaveNFe: string | null; IssueDate: string | null; Cfop: string | null;
  NfeStatus: string | null; Quantity: number | null; ExpectedQuantity: number | null; Difference: number | null;
};

export type StorageCustodySummary = {
  TransactionKey: string; Applies: boolean; NextRole: string; Steps: StorageCustodyStep[];
};

/** Entradas viram Documento de Entrada; devolução simbólica e retornos, Documento de Saída. */
export function isPurchaseRole(role: string): boolean {
  return role === "ProcessingEntry" || role === "StorageEntry";
}

/** $filter estático do value help de natureza (enum em sap.ui.model.Filter não serializa no OData V4). */
export function custodyUsageFilter(role: string): string {
  return `StorageCustodyRole eq '${role}' and Direction eq '${isPurchaseRole(role) ? "Incoming" : "Outgoing"}'`;
}

export function canGenerateCustody(summary: StorageCustodySummary | undefined, isStandalone: boolean): boolean {
  return isStandalone && !!summary && summary.Applies && !!summary.NextRole && summary.NextRole !== "None";
}

/** Mesma regra do preço da remessa para depósito. */
export function isCustodyPriceValid(value: unknown): boolean {
  return isRemittancePriceValid(value);
}

export function custodyStepState(situation: string): "Success" | "Warning" | "Error" | "None" {
  switch (situation) {
    case "Missing": return "Error";
    case "Generated": return "Warning";
    case "Authorized":
    case "Recorded": return "Success";
    default: return "None";
  }
}
