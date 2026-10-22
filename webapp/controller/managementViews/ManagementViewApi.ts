import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataCollection, sendJson } from "siagrob1/helpers/FetchHelpers";

export type ViewType = "IncomeStatement" | "BalanceSheet";
export type LineKind = "Total" | "Accounts" | "Formula";

export type ViewLine = {
  Order: number;
  Code: string;
  Description: string;
  ParentCode?: string;
  Kind: LineKind;
  AccountFrom?: string;
  AccountTo?: string;
  Sign: "Plus" | "Minus";
  Formula?: string;
  Bold: boolean;
  Hidden: boolean;
};

export type ManagementView = { Code: string; Name: string; Type: ViewType; UpdatedAt?: string; UpdatedBy?: string; Lines: ViewLine[] };

export const TYPE_TEXT: Record<ViewType, string> = { IncomeStatement: "DRE", BalanceSheet: "Balanço" };

/** Código da rota para incluir uma visão nova. */
export const NEW_CODE = "~new";

export async function loadViews(): Promise<ManagementView[]> {
  const result = await sendJson("GET", `${ServerRoutes.managementViews}?$expand=Lines&$orderby=Code`);
  if (!result.ok) throw new Error(result.message);
  return odataCollection<ManagementView>(result.data);
}

export async function saveView(view: ManagementView): Promise<void> {
  const result = await sendJson("POST", ServerRoutes.managementViews, view);
  if (!result.ok) throw new Error(result.message);
}
