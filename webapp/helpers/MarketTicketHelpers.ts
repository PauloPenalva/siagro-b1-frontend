import { EMPTY_VALUE } from "siagrob1/helpers/MarketHelpers";
import { KG_PER_SACK } from "siagrob1/helpers/MarketPriceGridHelpers";

/**
 * Funções puras da lista e do detalhe de boletas. Devolvem CHAVES de i18n quando precisam de texto; o
 * controller traduz. O OData entrega o status em PascalCase e o REST em camelCase: tudo aqui normaliza.
 */

export type TicketStatusKey = "pending" | "pendingBoard" | "approved" | "rejected" | "canceled";

/** Situações em aberto: as únicas que ainda aceitam aprovar, rejeitar ou cancelar. */
export const OPEN_TICKET_STATUSES = ["Pending", "PendingBoard"];

export const TICKET_STATUSES = ["Pending", "PendingBoard", "Approved", "Rejected", "Canceled"];

const STATUS_STATE: Record<string, "Warning" | "Success" | "Error" | "None"> = {
  pending: "Warning", pendingBoard: "Warning", approved: "Success", rejected: "Error", canceled: "None",
};

const STATUS_ICON: Record<string, string> = {
  pending: "sap-icon://pending", pendingBoard: "sap-icon://alert", approved: "sap-icon://accept",
  rejected: "sap-icon://decline", canceled: "sap-icon://cancel",
};

export function normalizeTicketStatus(status: string): string {
  return status ? status.charAt(0).toLowerCase() + status.slice(1) : "";
}

export function ticketStatusTextKey(status: string): string {
  const key = normalizeTicketStatus(status);
  return key in STATUS_STATE ? `marketTicketStatus_${key}` : "marketTicketStatus_unknown";
}

export function ticketStatusState(status: string): "Warning" | "Success" | "Error" | "None" {
  return STATUS_STATE[normalizeTicketStatus(status)] ?? "None";
}

export function ticketStatusIcon(status: string): string {
  return STATUS_ICON[normalizeTicketStatus(status)] ?? "";
}

/** O OData pode entregar decimal como string: converte sem inventar zero para valor ausente. */
function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const decimal2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal3 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** Quilos → sacas de 60 kg (sem arredondar: a boleta pode ter fração). */
export function kgToSacks(kg: unknown): number {
  const n = toNumber(kg);
  return n === null ? null : n / KG_PER_SACK;
}

export function formatSacks(kg: unknown): string {
  const n = kgToSacks(kg);
  return n === null ? EMPTY_VALUE : decimal3.format(n);
}

export function formatTons(kg: unknown): string {
  const n = toNumber(kg);
  return n === null ? EMPTY_VALUE : decimal3.format(n / 1000);
}

export function formatMoneyValue(value: unknown): string {
  const n = toNumber(value);
  return n === null ? EMPTY_VALUE : decimal2.format(n);
}

/** Valor total do negócio: sacas × preço negociado (R$/sc), em centavos (meio centavo sobe, estável contra erro binário). */
export function ticketTotalValue(kg: unknown, negotiatedPrice: unknown): number {
  const sacks = kgToSacks(kg), price = toNumber(negotiatedPrice);
  return sacks === null || price === null ? null : Math.round((sacks * price + Number.EPSILON) * 100) / 100;
}

/** Desvio em % com sinal e 2 casas ("+1,50%"); ausente vira "–". */
export function formatDeviation(value: unknown): string {
  const n = toNumber(value);
  if (n === null) return EMPTY_VALUE;
  return `${n > 0 ? "+" : ""}${decimal2.format(n)}%`;
}

/** Desvio negativo (abaixo da grade) é bom para quem compra; positivo é alerta. */
export function deviationState(value: unknown): "Success" | "Error" | "None" {
  const n = toNumber(value);
  if (n === null || n === 0) return "None";
  return n < 0 ? "Success" : "Error";
}

export function cityLabel(name: string, state: string): string {
  if (!name) return EMPTY_VALUE;
  return state ? `${name} - ${state}` : name;
}

/** Instante UTC do servidor → data e hora locais (`dd/MM/yyyy HH:mm`). Texto sem fuso é tratado como UTC. */
export function formatLocalDateTime(iso: string): string {
  if (!iso) return EMPTY_VALUE;
  const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

export type TicketStep = { key: string; value: number; unit: string };

/** `StepsJson` (array de { key, value, unit }); JSON ausente ou inválido vira lista vazia. */
export function parseTicketSteps(json: string): TicketStep[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as TicketStep[]) : [];
  } catch {
    return [];
  }
}

export type TicketsFilter = {
  Statuses?: string[]; HarvestSeasonCode?: string; CardCode?: string; DateFrom?: string; DateTo?: string;
};

const esc = (value: string) => value.replace(/'/g, "''");

function localDay(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * `$filter` cru da lista (Status é enum: nunca `new Filter`). `CreatedAt` é instante UTC: o dia filtrado é o
 * dia LOCAL do usuário, e o "até" inclui o último dia (limite exclusivo no início do dia seguinte).
 */
export function buildTicketsFilter(f: TicketsFilter): string {
  const parts: string[] = [];
  if (f.Statuses?.length) parts.push(`(${f.Statuses.map((s) => `Status eq '${esc(s)}'`).join(" or ")})`);
  if (f.HarvestSeasonCode?.trim()) parts.push(`HarvestSeasonCode eq '${esc(f.HarvestSeasonCode.trim())}'`);
  if (f.CardCode?.trim()) parts.push(`CardCode eq '${esc(f.CardCode.trim())}'`);
  if (f.DateFrom) parts.push(`CreatedAt ge ${localDay(f.DateFrom).toISOString()}`);
  if (f.DateTo) {
    const next = localDay(f.DateTo);
    next.setDate(next.getDate() + 1);
    parts.push(`CreatedAt lt ${next.toISOString()}`);
  }
  return parts.length ? parts.join(" and ") : undefined;
}

/**
 * O OData do servidor pode serializar em PascalCase ou camelCase conforme a configuração; a tela lê sempre
 * PascalCase. Capitaliza a 1ª letra das chaves (recursivo) e descarta anotações `@odata.*`.
 */
export function toPascalKeys<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => toPascalKeys<unknown>(v)) as T;
  if (value === null || typeof value !== "object") return value as T;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.startsWith("@")) continue;
    result[key.charAt(0).toUpperCase() + key.slice(1)] = toPascalKeys<unknown>(item);
  }
  return result as T;
}
