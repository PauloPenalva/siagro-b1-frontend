import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";
import { MarketQuote } from "siagrob1/types/MarketQuote";

/**
 * Funções puras do módulo Mercado (terminal de cotações) + a chamada REST com status HTTP.
 * O texto exibido vem do i18n: aqui só se decide a CHAVE e o estado.
 */

export const EMPTY_VALUE = "–";

const quoteNumber = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const percentNumber = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Valor nulo vira "–" (nunca "0" ou "null"). */
export function formatQuoteValue(value: number): string {
  return isNumber(value) ? quoteNumber.format(value) : EMPTY_VALUE;
}

/** Último preço; o sufixo " S" marca o ajuste (settlement). */
export function formatLast(value: number, isSettlement: boolean): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  return isSettlement ? `${quoteNumber.format(value)} S` : quoteNumber.format(value);
}

export function formatChangePercent(value: number): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  return `${value > 0 ? "+" : ""}${percentNumber.format(value)}%`;
}

export function changePercentState(value: number): "Success" | "Error" | "None" {
  if (!isNumber(value)) return "None";
  if (value > 0) return "Success";
  if (value < 0) return "Error";
  return "None";
}

/** Hora local de `quotedAt` (ISO do servidor). */
export function formatQuoteTime(iso: string): string {
  if (!iso) return EMPTY_VALUE;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Cotação lançada à mão: `source` Manual (string em qualquer caixa ou o número 1) ou override ativo. */
export function isManualQuote(source: string | number, manualOverride: boolean): boolean {
  if (manualOverride) return true;
  if (typeof source === "number") return source === 1;
  return typeof source === "string" && source.toLowerCase() === "manual";
}

/** Abas do terminal: grupos distintos na ordem em que aparecem (o servidor já ordena). */
export function extractGroups(quotes: Pick<MarketQuote, "groupName">[]): string[] {
  const groups: string[] = [];
  for (const quote of quotes ?? []) {
    const name = quote.groupName ?? "";
    if (!groups.includes(name)) groups.push(name);
  }
  return groups;
}

export type ConnectionView = {
  /** Chave do i18n; a mensagem do servidor entra como parâmetro {0} em `marketStatusError`. */
  textKey: string;
  state: "Success" | "Warning" | "Error" | "None" | "Information";
};

/**
 * Status mostrado no cabeçalho. A queda do próprio EventSource tem prioridade: com ela, o status
 * que veio do servidor está velho. O enum chega em camelCase pelo SSE - compara sem caixa.
 */
export function connectionView(status: string, browserDisconnected: boolean): ConnectionView {
  if (browserDisconnected) return { textKey: "marketStatusNoServer", state: "Error" };
  switch ((status ?? "").toLowerCase()) {
    case "connected":
      return { textKey: "marketStatusConnected", state: "Success" };
    case "connecting":
      return { textKey: "marketStatusConnecting", state: "Warning" };
    case "error":
      return { textKey: "marketStatusError", state: "Error" };
    case "disabled":
      return { textKey: "marketStatusDisabled", state: "Information" };
    default:
      return { textKey: "marketStatusConnecting", state: "Warning" };
  }
}

/** Texto digitado em pt-BR ("1.234,56") para número; vazio vira null, lixo vira NaN. */
export function parseDecimalInput(text: string): number {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

export type MarketResult<T = unknown> = { ok: boolean; status: number; data?: T; message?: string };

/**
 * REST do módulo Mercado. Diferente de `sendJson`, devolve o status HTTP: 404 em `/market`
 * significa "módulo desligado neste ambiente", e quem chama mostra isso em vez do erro cru.
 * Erro de negócio é 400 com o texto puro no corpo.
 */
export async function marketFetch<T = unknown>(
  method: "GET" | "POST" | "PUT",
  url: string,
  payload?: object
): Promise<MarketResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!response.ok) {
      return { ok: false, status: response.status, message: await readErrorMessage(response) };
    }
    const text = await response.text();
    return { ok: true, status: response.status, data: text ? (JSON.parse(text) as T) : undefined };
  } catch {
    return { ok: false, status: 0 };
  }
}
