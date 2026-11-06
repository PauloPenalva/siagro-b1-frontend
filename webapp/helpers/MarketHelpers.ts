import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";
import { FlashField, FlashMap, MarketQuote, MarketQuoteRow } from "siagrob1/types/MarketQuote";

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

const noFlash = (): FlashMap => ({ last: "", bid: "", high: "", low: "", open: "" });
const noFlashAt = (): Record<FlashField, number> => ({ last: 0, bid: 0, high: 0, low: 0, open: 0 });

/**
 * Compara o quadro novo com o anterior (pelo código, nunca pela posição) e devolve as linhas com o
 * descritor de piscada de cada preço. `previous` nulo = linha de base (primeiro quadro do stream): nada
 * pisca. Só pisca quando os dois valores são números e diferem. A fase "a"/"b" alterna com `seq` para
 * o CSS trocar de keyframes e a animação reiniciar mesmo em duas altas seguidas. Um descritor ainda mais
 * novo que FLASH_DURATION_MS segue IDÊNTICO (o atributo no DOM não muda e a animação termina); `now`
 * vem de quem chama, para a função seguir pura.
 */
export function withFlashes(previous: (MarketQuote | MarketQuoteRow)[], next: MarketQuote[], seq: number, now: number): MarketQuoteRow[] {
  const before = new Map((previous ?? []).map((p) => [p.code, p as MarketQuoteRow]));
  const phase = seq % 2 === 0 ? "b" : "a";
  return (next ?? []).map((quote) => {
    const flash = noFlash();
    const flashAt = noFlashAt();
    const old = previous ? before.get(quote.code) : undefined;
    if (old) {
      for (const field of FLASH_FIELDS) {
        const a = old[field], b = quote[field];
        if (typeof a === "number" && typeof b === "number" && a !== b) {
          flash[field] = `${b > a ? "up" : "down"}-${phase}-${seq}`;
          flashAt[field] = now;
        } else if (old.flash?.[field] && now - (old.flashAt?.[field] ?? 0) < FLASH_DURATION_MS) {
          flash[field] = old.flash[field];
          flashAt[field] = old.flashAt[field];
        }
      }
    }
    return { ...quote, flash, flashAt };
  });
}

/** Troca de aba/refiltro: as linhas recicladas não podem repetir a piscada da linha anterior. */
export function clearFlashes(rows: MarketQuoteRow[]): MarketQuoteRow[] {
  return (rows ?? []).map((row) => ({ ...row, flash: noFlash(), flashAt: noFlashAt() }));
}

/** Valor do atributo data-market-flash: sempre string (linha vazia da grade não tem contexto). */
export function flashAttr(value: unknown): string {
  return typeof value === "string" ? value : "";
}
