import { formatDateText, formatKg, formatLocalDate } from "siagrob1/helpers/SapInvoiceLinkHelpers";

/**
 * Linha da lista de NF de devolução do SAP (A/R Credit Memo) vinculáveis a uma devolução da carga, já normalizada
 * (a function devolve objetos simples, não entidades). GAC-1226.
 */
export type LinkableCreditMemo = {
  DocEntry: number,
  DocNum: number,
  /** Texto dd/MM/yyyy, montado da string da data sem passar por `Date`. */
  DocDateText: string,
  /** `yyyy-MM-dd`: chave de ordenação da coluna Data. */
  DocDateSort: string,
  /** "NF / Série" e "(código) nome" prontos: a tabela filtra/ordena pela própria coluna exibida. */
  InvoiceText: string,
  CustomerText: string,
  Quantity: number,
  UnitPrice: number,
  LineTotal: number,
  Cfop: string,
  UsageText: string,
  /** A nota referencia a invoice vinculada ao documento de origem da devolução. Só destaca. */
  MatchesOrigin: boolean,
  /** Quantidade igual à da devolução: só estas podem ser vinculadas. */
  QuantityMatches: boolean,
}

/** Documento de devolução da carga — os campos que o selo, os botões e o diálogo usam. */
export type ReturnDocumentRow = {
  Key?: string,
  InvoiceNumber?: string,
  InvoiceType?: string,
  InvoiceStatus?: string,
  InvoiceDate?: string | Date,
  TaxDocumentNumber?: string,
  WithoutTaxDocument?: boolean,
  SapDocNum?: number,
  SapCreditMemoDocEntry?: number,
  SapCreditMemoDocNum?: number,
  /** Quantidade da devolução (soma das linhas), para o cabeçalho do diálogo. */
  Quantity?: number,
}

type Raw = Record<string, unknown>;

/** Lê o campo em PascalCase (modelo OData) ou camelCase (REST puro) — a API já alternou entre os dois. */
function pick(raw: Raw, name: string): unknown {
  return raw[name] ?? raw[name.charAt(0).toLowerCase() + name.slice(1)];
}

/**
 * Normaliza a resposta da function `ShipmentLoadsGetLinkableSapCreditMemos`: aceita o array ou o envelope OData
 * `{ value: [...] }` (é o que `getObject()` entrega para function que devolve coleção), nas duas capitalizações.
 */
export function normalizeLinkableCreditMemos(data: unknown): LinkableCreditMemo[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { value?: unknown })?.value) ? (data as { value: unknown[] }).value : [];

  return rows.map((row) => {
    const raw = (row ?? {}) as Raw;
    const text = (name: string) => {
      const value = pick(raw, name);
      return typeof value === "string" || typeof value === "number" ? String(value) : "";
    };
    const num = (name: string) => Number(pick(raw, name) ?? 0);
    const usageCode = text("UsageCode");
    const usageName = text("UsageName");
    return {
      DocEntry: num("DocEntry"),
      DocNum: num("DocNum"),
      DocDateText: formatDateText(pick(raw, "DocDate")),
      DocDateSort: (/^\d{4}-\d{2}-\d{2}/.exec(text("DocDate")) ?? [""])[0],
      InvoiceText: `${text("TaxDocumentNumber")} / ${text("TaxDocumentSeries")}`,
      CustomerText: `(${text("CardCode")}) ${text("CardName")}`,
      Quantity: num("Quantity"),
      UnitPrice: num("UnitPrice"),
      LineTotal: num("LineTotal"),
      Cfop: text("Cfop"),
      UsageText: usageCode && usageName ? `(${usageCode}) ${usageName}` : usageCode || usageName,
      MatchesOrigin: pick(raw, "MatchesOrigin") === true,
      QuantityMatches: pick(raw, "QuantityMatches") === true,
    };
  });
}

/**
 * "Aguardando NF do SAP": devolução confirmada que ainda não tem a NF de devolução do SAP vinculada, nem número
 * digitado, nem está marcada como operação sem nota. Só em modo SAP.
 */
export function isAwaitingSapReturnInvoice(row: ReturnDocumentRow, sapMode: boolean): boolean {
  return sapMode === true
    && row?.InvoiceType === "Return"
    && row?.InvoiceStatus === "Confirmed"
    && row?.SapCreditMemoDocEntry == null
    && !row?.TaxDocumentNumber
    && row?.WithoutTaxDocument !== true;
}

/** Devolução confirmada com a NF de devolução do SAP vinculada: é a que pode ser desvinculada. */
export function isSapReturnInvoiceLinked(row: ReturnDocumentRow, sapMode: boolean): boolean {
  return sapMode === true
    && row?.InvoiceType === "Return"
    && row?.InvoiceStatus === "Confirmed"
    && row?.SapCreditMemoDocEntry != null;
}

/** "Vincular" habilita com uma nota escolhida de quantidade igual à da devolução. */
export function canLinkCreditMemo(selected: LinkableCreditMemo): boolean {
  return !!selected && selected.QuantityMatches === true;
}

/**
 * Período padrão da busca: da emissão da devolução até hoje (a nota do SAP sai depois da recusa). Sem data, ou com
 * a devolução datada no futuro, cai em hoje − 30 dias.
 */
export function defaultReturnLinkPeriod(
  invoiceDate: string | Date, today: Date = new Date(),
): { DateFrom: string, DateTo: string } {
  const to = formatLocalDate(today);
  const fallback = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30));

  let from = "";
  if (invoiceDate instanceof Date && !isNaN(invoiceDate.getTime())) {
    from = formatLocalDate(invoiceDate);
  } else if (typeof invoiceDate === "string") {
    // Data pura do OData: lê o texto, sem passar por Date (em UTC recuaria um dia no Brasil).
    from = (/^\d{4}-\d{2}-\d{2}/.exec(invoiceDate) ?? [""])[0];
  }

  return { DateFrom: from && from <= to ? from : fallback, DateTo: to };
}

/** Coluna "Doc. SAP": número da invoice de venda ou, na devolução, do Credit Memo. */
export function sapDocNumText(sapDocNum: unknown, sapCreditMemoDocNum: unknown): string {
  const value = sapDocNum ?? sapCreditMemoDocNum;
  return typeof value === "number" || (typeof value === "string" && value !== "") ? String(value) : "";
}

/** Cabeçalho do diálogo: "Devolução DV000031 — 30.000,000 kg". */
export function returnDocumentSummary(row: ReturnDocumentRow): string {
  return `Devolução ${row?.InvoiceNumber ?? ""} — ${formatKg(Number(row?.Quantity) || 0)} kg`;
}
