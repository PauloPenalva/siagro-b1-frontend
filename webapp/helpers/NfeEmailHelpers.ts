/** Regras puras do e-mail da NF-e (sem UI): formato, repetição, limite e rótulos do histórico. */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const NFE_EMAIL_MAX = 10;

/**
 * Confere a lista de e-mails da NF-e (cadastro do parceiro e diálogo de envio usam a mesma regra).
 * Devolve a mensagem de erro em pt-BR ou `""` se estiver válida; o servidor revalida.
 */
export function nfeEmailListError(addresses: string[], scope = "parceiro"): string {
  const list = addresses.map((a) => (a ?? "").trim()).filter((a) => a !== "");
  const lower = list.map((a) => a.toLowerCase());
  if (list.some((a) => !EMAIL_PATTERN.test(a))) {
    return "Há e-mail da NF-e com formato inválido.";
  }
  if (lower.some((a, i) => lower.indexOf(a) !== i)) {
    return "Há e-mail da NF-e repetido.";
  }
  if (list.length > NFE_EMAIL_MAX) {
    return `Máximo de ${NFE_EMAIL_MAX} e-mails por ${scope}.`;
  }
  return "";
}

export type NfeEmailMessageRow = {
  DocumentType?: string; EventType: string; Trigger: string; Status: string; Recipients?: string;
  LastError?: string; CreatedAt?: string; CreatedBy?: string;
};

const STATUS: Record<string, string> = { Pending: "Pendente", Sent: "Enviado", Failed: "Falhou", Skipped: "Ignorado" };
const STATUS_STATE: Record<string, string> = { Pending: "Warning", Sent: "Success", Failed: "Error", Skipped: "None" };
const EVENT: Record<string, string> = { Authorized: "Autorização", Cancelled: "Cancelamento" };
const TRIGGER: Record<string, string> = { Automatic: "Automático", Manual: "Manual" };

export function toNfeEmailHistoryRow(row: NfeEmailMessageRow) {
  return {
    createdAt: row.CreatedAt ? new Date(row.CreatedAt).toLocaleString("pt-BR") : "",
    event: EVENT[row.EventType] ?? row.EventType,
    trigger: TRIGGER[row.Trigger] ?? row.Trigger,
    recipients: (row.Recipients ?? "").split(";").filter((r) => r !== "").join(", "),
    status: STATUS[row.Status] ?? row.Status,
    state: STATUS_STATE[row.Status] ?? "None",
    error: row.LastError ?? "",
    user: row.CreatedBy ?? "",
  };
}
