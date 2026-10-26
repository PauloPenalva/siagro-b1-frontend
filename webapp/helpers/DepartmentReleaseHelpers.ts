import formatter from "siagrob1/model/formatter";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ListBinding from "sap/ui/model/ListBinding";
import Control from "sap/ui/core/Control";
import Select from "sap/m/Select";
import Table from "sap/m/Table";

/** Departamentos da liberação (GAC-1188): código no backend, rótulo da tela e permissão exigida. */
export const DEPARTMENT_RELEASES: { code: string; label: string; permission: string }[] = [
  { code: "Board", label: "Lib. Diretoria", permission: "PAYMENT_RELEASE_BOARD" },
  { code: "Stock", label: "Lib. Estoque", permission: "PAYMENT_RELEASE_STOCK" },
  { code: "Legal", label: "Lib. Jurídico", permission: "PAYMENT_RELEASE_LEGAL" },
  { code: "Fiscal", label: "Lib. Fiscal", permission: "PAYMENT_RELEASE_FISCAL" },
  { code: "Royalties", label: "Lib. Royalties", permission: "PAYMENT_RELEASE_ROYALTIES" },
  { code: "Financial", label: "Lib. Financeiro", permission: "PAYMENT_RELEASE_FINANCIAL" },
  { code: "Store", label: "Lib. Loja", permission: "PAYMENT_RELEASE_STORE" },
];

/** Departamentos hoje liberados no contrato, a partir do PaymentReleases carregado pela lista. */
export function releasedDepartmentCodes(releases?: { Department: string; Released?: boolean }[]): string[] {
  return (releases ?? []).filter((r) => r.Released).map((r) => r.Department);
}

export type ReleaseHistoryRow = {
  Id?: string;
  Department: string;
  Released: boolean;
  Reason?: string;
  ChangedAt?: string;
  ChangedBy?: string;
};

export type ReleaseHistoryItem = {
  code: string;
  department: string;
  released: string;
  state: string;
  reason: string;
  user: string;
  when: string;
};

/**
 * Linhas do histórico prontas para a tabela: mais recente primeiro, só dos departamentos
 * informados (todos quando `allowed` não vem).
 */
export function mapReleaseHistory(rows: ReleaseHistoryRow[], allowed?: string[]): ReleaseHistoryItem[] {
  return (rows ?? [])
    .filter((r) => !allowed || allowed.includes(r.Department))
    .sort((a, b) => (b.ChangedAt ?? "").localeCompare(a.ChangedAt ?? ""))
    .map((r) => ({
      code: r.Department,
      department: DEPARTMENT_RELEASES.find((d) => d.code === r.Department)?.label ?? r.Department,
      released: r.Released ? "Sim" : "Não",
      state: r.Released ? "Success" : "Error",
      reason: r.Reason ?? "",
      user: r.ChangedBy ?? "",
      when: r.ChangedAt ? formatter.formatDateTime(r.ChangedAt) : "",
    }));
}

/** Chave da opção "Todos" do filtro de departamento do histórico. */
export const HISTORY_ALL_DEPARTMENTS = "ALL";

/** Opções do filtro de departamento do histórico: "Todos" + os departamentos informados (todos se não vier). */
export function historyDepartmentOptions(allowed?: string[]): { key: string; text: string }[] {
  return [
    { key: HISTORY_ALL_DEPARTMENTS, text: "Todos" },
    ...DEPARTMENT_RELEASES
      .filter((d) => !allowed || allowed.includes(d.code))
      .map((d) => ({ key: d.code, text: d.label })),
  ];
}

function findHistoryTable(root: Control): Table | undefined {
  return root.findAggregatedObjects(true, (c) => c instanceof Table)[0] as Table | undefined;
}

/** Aplica ao Table do mesmo container do Select o filtro (client-side) pelo departamento escolhido. */
export function applyHistoryDepartmentFilter(select: Select): void {
  const table = findHistoryTable(select.getParent() as Control);
  const key = select.getSelectedKey();
  const binding = table?.getBinding("items") as ListBinding | undefined;
  binding?.filter(key && key !== HISTORY_ALL_DEPARTMENTS ? [new Filter("code", FilterOperator.EQ, key)] : []);
}

/** Tira o filtro do histórico do diálogo (a chave do Select volta a "Todos" pelo modelo). */
export function clearHistoryDepartmentFilter(dialog: Control): void {
  (findHistoryTable(dialog)?.getBinding("items") as ListBinding | undefined)?.filter([]);
}

/** Opções dos filtros "Lib. <departamento>": Todos (sem filtro), Sim (liberado) e Não. */
export const RELEASE_FILTER_ALL = "ALL";
export const RELEASE_FILTER_YES = "YES";
export const RELEASE_FILTER_NO = "NO";

/** Estado inicial dos filtros por departamento: todos em "Todos". */
export function defaultReleaseFilters(): Record<string, string> {
  return Object.fromEntries(DEPARTMENT_RELEASES.map((d) => [d.code, RELEASE_FILTER_ALL]));
}

/**
 * Cláusulas `$filter` (texto cru, pois enum não passa pelo sap.ui.model.Filter) dos filtros por
 * departamento. Só considera os departamentos informados em `allowed`.
 */
export function departmentReleaseFilterClauses(selection: Record<string, string>, allowed: string[]): string[] {
  const clauses: string[] = [];
  for (const d of DEPARTMENT_RELEASES) {
    const value = selection?.[d.code];
    if (!allowed.includes(d.code) || (value !== RELEASE_FILTER_YES && value !== RELEASE_FILTER_NO)) continue;
    const any = `PaymentReleases/any(r: r/Department eq '${d.code}' and r/Released eq true)`;
    clauses.push(value === RELEASE_FILTER_YES ? any : `not ${any}`);
  }
  return clauses;
}
