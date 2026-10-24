/** Regras puras das telas da EFD-Reinf (testadas em QUnit). */

export type ValueStateName = "Success" | "Error" | "Warning" | "Information" | "None";

const SITUATION_STATES: Record<string, ValueStateName> = {
  Aceito: "Success",
  Rejeitado: "Error",
  Desatualizado: "Warning",
  Excluir: "Warning",
  "Excluído": "None",
  Novo: "Information",
  Enviado: "Information",
  "Sem movimento": "None",
  Verificar: "Warning",
};

/** Cor (ValueState) da situação de uma linha da visão do período. */
export function reinfSituationState(situation?: string): ValueStateName {
  return SITUATION_STATES[situation ?? ""] ?? "None";
}

const PERIOD_TEXTS: Record<string, string> = {
  Open: "Aberto", Closing: "Fechando", Closed: "Fechado", Reopening: "Reabrindo",
};

export function reinfPeriodStatusText(status?: string): string {
  return PERIOD_TEXTS[status ?? ""] ?? (status || "Aberto");
}

const EVENT_TEXTS: Record<string, string> = {
  Pending: "Pendente", Sent: "Enviado", Accepted: "Aceito", Rejected: "Rejeitado", Excluded: "Excluído", Outdated: "Desatualizado",
  Unconfirmed: "Sem confirmação",
};

export function reinfEventStatusText(status?: string): string {
  return EVENT_TEXTS[status ?? ""] ?? (status ?? "");
}

const EVENT_STATES: Record<string, ValueStateName> = {
  Pending: "Information", Sent: "Information", Accepted: "Success", Rejected: "Error", Excluded: "None", Outdated: "Warning", Unconfirmed: "Warning",
};

export function reinfEventStatusState(status?: string): ValueStateName {
  return EVENT_STATES[status ?? ""] ?? "None";
}

const BATCH_TEXTS: Record<string, string> = {
  Sent: "Enviado", Processing: "Em processamento", Processed: "Processado", Refused: "Recusado", Failed: "Falhou",
};

export function reinfBatchStatusText(status?: string): string {
  return BATCH_TEXTS[status ?? ""] ?? (status ?? "");
}

/** Situação do cadastro (R-1000), enum numérico ReinfRegistrationStatus. */
export function reinfRegistrationText(status?: number): string {
  return ["Não enviado", "Enviado", "Aceito", "Rejeitado"][status ?? 0] ?? "";
}

export function reinfRegistrationState(status?: number): ValueStateName {
  return (["None", "Information", "Success", "Error"] as ValueStateName[])[status ?? 0] ?? "None";
}

/** Habilitação dos botões pela situação do período. */
export function reinfPeriodActions(status: string, hasRows: boolean) {
  const s = status || "Open";
  return {
    canTransmit: s === "Open" && hasRows,
    canClose: s === "Open",
    canReopen: s === "Closed",
  };
}

/** Alguma linha sem confirmação da Receita ("Verificar"): mostra "Liberar reenvio". */
export function reinfHasUnconfirmed(rows: { Situation?: string }[]): boolean {
  return rows.some((r) => r.Situation === "Verificar");
}

/** Lotes ainda pendentes de consulta (Enviado / Em processamento), sem repetição. */
export function reinfPendingBatchKeys(events: { BatchKey?: string; BatchStatus?: string }[]): string[] {
  const keys = new Set<string>();
  for (const e of events) {
    if (e.BatchKey && (e.BatchStatus === "Sent" || e.BatchStatus === "Processing")) keys.add(e.BatchKey);
  }
  return [...keys];
}

/** Aceita a resposta em PascalCase ou camelCase e devolve sempre PascalCase (nível de topo). */
export function pascalKeys<T>(obj: unknown): T {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k.startsWith("@")) continue;
    out[k.charAt(0).toUpperCase() + k.slice(1)] = v;
  }
  return out as T;
}

/** Literal de string para chave de função OData. */
export function odataString(value: string): string {
  return `'${encodeURIComponent(value.replace(/'/g, "''"))}'`;
}

/** Mês anterior (AAAA-MM) ao da data; sempre a partir do dia 1, sem estouro em 29–31. */
export function reinfPreviousPeriod(today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
