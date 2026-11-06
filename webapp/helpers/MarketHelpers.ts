import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";
import { FlashField, MarketQuote, MarketQuoteRow } from "siagrob1/types/MarketQuote";

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

/**
 * Instante do servidor (gravado em UTC). Sem sufixo de fuso ("Z" ou "+hh:mm") o texto é tratado como
 * UTC: `new Date` o leria como hora LOCAL e a tela mostraria 3 h a mais.
 */
export function parseServerInstant(iso: string): Date {
  if (!iso) return null;
  const text = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
  return new Date(text);
}

/** Hora local de `quotedAt` (ISO do servidor, instante UTC). */
export function formatQuoteTime(iso: string): string {
  if (!iso) return EMPTY_VALUE;
  const date = parseServerInstant(iso);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Cotação lançada à mão: `source` Manual (string em qualquer caixa ou o número 1) ou override ativo. */
export function isManualQuote(source: string | number, manualOverride: boolean): boolean {
  if (manualOverride) return true;
  if (typeof source === "number") return source === 1;
  return typeof source === "string" && source.toLowerCase() === "manual";
}

/** Tooltip da origem: quem lançou, quando o servidor informa. */
export function manualTooltip(generic: string, byPattern: string, userName: string): string {
  return userName && byPattern ? byPattern.replace("{0}", userName) : generic;
}

/**
 * Chave da aba "Sem grupo". Não pode ser "": com key vazia o IconTabBar devolve o id gerado do
 * IconTabFilter como selectedKey e o filtro da tabela não casa com nada.
 */
export const NO_GROUP_KEY = "__none__";

/** Grupo → chave da aba. */
export function groupKey(groupName: string): string {
  const name = normalizeGroupName(groupName);
  return name === "" ? NO_GROUP_KEY : name;
}

/** Chave da aba → valor de `groupName` usado no filtro. */
export function groupFromKey(key: string): string {
  return key === NO_GROUP_KEY ? "" : (key ?? "");
}

/**
 * Desvio do novo último preço em relação ao anterior, em % (absoluto). Nulo sem anterior utilizável.
 * Acima de 20 % o diálogo pede confirmação ("1.188" digitado querendo dizer 1188).
 */
export function deviationPercent(newValue: number, oldValue: number): number {
  if (!isNumber(newValue) || !isNumber(oldValue) || oldValue === 0) return null;
  return Math.abs((newValue - oldValue) / oldValue) * 100;
}

export const MANUAL_DEVIATION_LIMIT = 20;

/** Grupo nulo, indefinido ou em branco vira "" (aba "Sem grupo"); o filtro da aba compara com "". */
export function normalizeGroupName(name: string): string {
  return (name ?? "").trim();
}

/** Normaliza o grupo de cada linha num só lugar, antes de ir para o modelo. */
export function normalizeQuotes<T extends { groupName: string }>(quotes: T[]): T[] {
  return (quotes ?? []).map((q) => ({ ...q, groupName: normalizeGroupName(q.groupName) }));
}

/** Abas do terminal: grupos distintos na ordem em que aparecem (o servidor já ordena). */
export function extractGroups(quotes: Pick<MarketQuote, "groupName">[]): string[] {
  const groups: string[] = [];
  for (const quote of quotes ?? []) {
    const name = normalizeGroupName(quote.groupName);
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

/**
 * Texto digitado para número. Vazio → null; inválido → NaN (o diálogo marca o campo e não envia).
 * Com vírgula: pt-BR (pontos são milhar, vírgula é decimal: "1.188,25" → 1188,25).
 * Sem vírgula e com UM ponto: o ponto é decimal ("4.25" → 4,25) - cotação da CBOT/dólar costuma
 * vir assim, e tirar o ponto multiplicaria o preço por 100. Sem vírgula e com mais de um ponto
 * ("1.188.250") é ambíguo: inválido.
 */
export function parseDecimalInput(text: string): number {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  let normalized: string;
  if (raw.includes(",")) {
    if (!/^-?\d{1,3}(\.\d{3})*,\d+$/.test(raw) && !/^-?\d+,\d+$/.test(raw)) return NaN;
    normalized = raw.replace(/\./g, "").replace(",", ".");
  } else {
    if ((raw.match(/\./g) ?? []).length > 1) return NaN;
    normalized = raw;
  }
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

export type MarketResult<T = unknown> = {
  ok: boolean; status: number; data?: T; message?: string;
  /** 404 com `X-Market-Module: disabled`: o Web recusou porque o módulo está desligado. */
  moduleDisabled?: boolean;
};

/** Cabeçalho que o Web põe no 404 do módulo desligado (o 404 do Gateway sem rota não tem). */
export const MODULE_HEADER = "X-Market-Module";

/** Chave do i18n para um 404 do Mercado: módulo desligado ou rota /market ausente no Gateway. */
export function notFoundTextKey(moduleDisabled: boolean): string {
  return moduleDisabled ? "marketModuleDisabled" : "marketServiceNotFound";
}

/**
 * REST do módulo Mercado. Diferente de `sendJson`, devolve o status HTTP: um 404 em `/market` é
 * "módulo desligado" só com o cabeçalho `X-Market-Module: disabled`; sem ele, a rota não existe.
 * Erro de negócio é 400 com o texto puro no corpo.
 */
export async function marketFetch<T = unknown>(
  method: "GET" | "POST" | "PUT" | "DELETE",
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
      const moduleDisabled = response.status === 404
        && (response.headers.get(MODULE_HEADER) ?? "").toLowerCase() === "disabled";
      return { ok: false, status: response.status, message: await readErrorMessage(response), moduleDisabled };
    }
    const text = await response.text();
    return { ok: true, status: response.status, data: text ? (JSON.parse(text) as T) : undefined };
  } catch {
    return { ok: false, status: 0 };
  }
}

export const FLASH_FIELDS: FlashField[] = ["last", "bid", "high", "low", "open"];

/** Duração da piscada em ms: deve ser igual à do `animation: ... 1s` em css/style.css. */
export const FLASH_DURATION_MS = 1000;

/** Linha com o descritor de piscada de cada campo (só no JSONModel, nunca vai ao servidor). */
export type FlashedRow<T, F extends string> = T & { flash: Record<F, string>; flashAt?: Record<F, number> };

function emptyFlash<F extends string, V>(fields: readonly F[], value: V): Record<F, V> {
  const map = {} as Record<F, V>;
  for (const field of fields) map[field] = value;
  return map;
}

/**
 * Núcleo genérico das piscadas: compara o quadro novo com o anterior pela CHAVE da linha (nunca pela
 * posição) e devolve as linhas com o descritor de cada campo de `fields`. `previous` nulo = linha de base
 * (primeiro quadro do stream): nada pisca. Só pisca quando os dois valores são números e diferem. A fase
 * "a"/"b" alterna com `seq` para o CSS trocar de keyframes e a animação reiniciar mesmo em duas altas
 * seguidas. Um descritor ainda mais novo que FLASH_DURATION_MS segue IDÊNTICO (o atributo no DOM não muda
 * e a animação termina); `now` vem de quem chama, para a função seguir pura.
 */
export function computeFlashes<T extends object, F extends string & keyof T, K>(
  previous: T[],
  next: T[],
  keyOf: (row: T) => K,
  fields: readonly F[],
  seq: number,
  now: number
): FlashedRow<T, F>[] {
  const before = new Map((previous ?? []).map((p) => [keyOf(p), p as FlashedRow<T, F>]));
  const phase = seq % 2 === 0 ? "b" : "a";
  return (next ?? []).map((row) => {
    const flash = emptyFlash(fields, "");
    const flashAt = emptyFlash(fields, 0);
    const old = previous ? before.get(keyOf(row)) : undefined;
    if (old) {
      for (const field of fields) {
        const a = old[field] as unknown, b = row[field] as unknown;
        if (typeof a === "number" && typeof b === "number" && a !== b) {
          flash[field] = `${b > a ? "up" : "down"}-${phase}-${seq}`;
          flashAt[field] = now;
        } else if (old.flash?.[field] && now - (old.flashAt?.[field] ?? 0) < FLASH_DURATION_MS) {
          flash[field] = old.flash[field];
          flashAt[field] = old.flashAt[field];
        }
      }
    }
    return { ...row, flash, flashAt };
  });
}

/** Troca de filtro/aba/cidade: as linhas recicladas não podem repetir a piscada da linha anterior. */
export function clearRowFlashes<T extends object, F extends string>(rows: T[], fields: readonly F[]): FlashedRow<T, F>[] {
  return (rows ?? []).map((row) => ({ ...row, flash: emptyFlash(fields, ""), flashAt: emptyFlash(fields, 0) }));
}

/** Terminal de cotações: piscadas comparadas pelo `code` nos cinco preços de FLASH_FIELDS. */
export function withFlashes(previous: (MarketQuote | MarketQuoteRow)[], next: MarketQuote[], seq: number, now: number): MarketQuoteRow[] {
  return computeFlashes<MarketQuote, FlashField, string>(previous, next, (q) => q.code, FLASH_FIELDS, seq, now);
}

/** Troca de aba/refiltro do terminal. */
export function clearFlashes(rows: MarketQuoteRow[]): MarketQuoteRow[] {
  return clearRowFlashes(rows, FLASH_FIELDS);
}

/** Valor do atributo data-market-flash: sempre string (linha vazia da grade não tem contexto). */
export function flashAttr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Permissões do usuário que interessam à boleta (já com o bypass de administrador do SessionService). */
export type TicketPermissions = { approve: boolean; boardApprove: boolean };

export type TicketActions = { approve: boolean; reject: boolean; cancel: boolean };

/**
 * Quais botões a boleta mostra. Espelha o servidor (que é quem decide): `pending` pede MARKET_TICKET_APPROVE,
 * `pendingBoard` pede MARKET_BOARD_APPROVE; cancelar vale para o criador ou para quem aprova no 1º nível.
 * Aprovada, rejeitada e cancelada são finais. Aceita o status em PascalCase (OData) ou camelCase (REST).
 */
export function ticketActions(status: string, permissions: TicketPermissions, isCreator: boolean): TicketActions {
  const none: TicketActions = { approve: false, reject: false, cancel: false };
  const key = status ? status.charAt(0).toLowerCase() + status.slice(1) : "";
  if (key !== "pending" && key !== "pendingBoard") return none;
  const decide = key === "pending" ? permissions?.approve === true : permissions?.boardApprove === true;
  return { approve: decide, reject: decide, cancel: isCreator === true || permissions?.approve === true };
}
