import formatter from "siagrob1/model/formatter";

/** Departamentos da liberação (GAC-1188): código no backend, rótulo da tela e permissão exigida. */
export const DEPARTMENT_RELEASES: { code: string; label: string; permission: string }[] = [
  { code: "Stock", label: "Lib. Estoque", permission: "PAYMENT_RELEASE_STOCK" },
  { code: "Legal", label: "Lib. Jurídico", permission: "PAYMENT_RELEASE_LEGAL" },
  { code: "Fiscal", label: "Lib. Fiscal", permission: "PAYMENT_RELEASE_FISCAL" },
  { code: "Royalties", label: "Lib. Royalties", permission: "PAYMENT_RELEASE_ROYALTIES" },
  { code: "Financial", label: "Lib. Financeiro", permission: "PAYMENT_RELEASE_FINANCIAL" },
  { code: "Store", label: "Lib. Loja", permission: "PAYMENT_RELEASE_STORE" },
  { code: "Board", label: "Lib. Diretoria", permission: "PAYMENT_RELEASE_BOARD" },
];

export type ReleaseHistoryRow = {
  Id?: string;
  Department: string;
  Released: boolean;
  Reason?: string;
  ChangedAt?: string;
  ChangedBy?: string;
};

export type ReleaseHistoryItem = {
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
      department: DEPARTMENT_RELEASES.find((d) => d.code === r.Department)?.label ?? r.Department,
      released: r.Released ? "Sim" : "Não",
      state: r.Released ? "Success" : "Error",
      reason: r.Reason ?? "",
      user: r.ChangedBy ?? "",
      when: r.ChangedAt ? formatter.formatDateTime(r.ChangedAt) : "",
    }));
}
