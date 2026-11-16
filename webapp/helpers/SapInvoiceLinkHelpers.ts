/** Linha da lista de NF do SAP vinculáveis, já normalizada (a function devolve objetos simples, não entidades). */
export type LinkableSapInvoice = {
  DocEntry: number,
  DocNum: number,
  /** Texto dd/MM/yyyy, montado da string da data sem passar por `Date` (data pura em UTC recuaria um dia no Brasil). */
  DocDateText: string,
  CardCode: string,
  CardName: string,
  TaxDocumentNumber: string,
  TaxDocumentSeries: string,
  Quantity: number,
  UnitPrice: number,
  LineTotal: number,
  Cfop: string,
  CarrierCode: string,
  CarrierMismatch: boolean,
  FreightTerms: string,
  AccessKey: string,
}

/** Liberação de entrega de venda — só o que o filtro por cliente e a pré-seleção usam. */
export type CustomerRelease = { CardCode?: string }

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** `yyyy-MM-dd` pelas partes LOCAIS da data: `toISOString()` daria a data em UTC e, à noite no Brasil, o dia seguinte. */
export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Período padrão da busca: hoje − 15 dias até hoje, em horário local. */
export function defaultLinkPeriod(today: Date = new Date()): { DateFrom: string, DateTo: string } {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 15);
  return { DateFrom: formatLocalDate(from), DateTo: formatLocalDate(today) };
}

/** dd/MM/yyyy a partir do início `yyyy-MM-dd` de uma string de data; vazio se não casar. */
export function formatDateText(value: unknown): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof value === "string" ? value : "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

type Raw = Record<string, unknown>;

/** Lê o campo em PascalCase (modelo OData) ou camelCase (REST puro) — a API já alternou entre os dois. */
function pick(raw: Raw, name: string): unknown {
  return raw[name] ?? raw[name.charAt(0).toLowerCase() + name.slice(1)];
}

/** Normaliza a resposta da function `ShipmentLoadsGetLinkableSapInvoices` (aceita as duas capitalizações). */
export function normalizeLinkableInvoices(data: unknown): LinkableSapInvoice[] {
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
    return {
      DocEntry: num("DocEntry"),
      DocNum: num("DocNum"),
      DocDateText: formatDateText(pick(raw, "DocDate")),
      CardCode: text("CardCode"),
      CardName: text("CardName"),
      TaxDocumentNumber: text("TaxDocumentNumber"),
      TaxDocumentSeries: text("TaxDocumentSeries"),
      Quantity: num("Quantity"),
      UnitPrice: num("UnitPrice"),
      LineTotal: num("LineTotal"),
      Cfop: text("Cfop"),
      CarrierCode: text("CarrierCode"),
      CarrierMismatch: pick(raw, "CarrierMismatch") === true,
      FreightTerms: text("FreightTerms"),
      AccessKey: text("AccessKey"),
    };
  });
}

/** Só as liberações do cliente da NF escolhida (o backend recusa de outro cliente). Sem NF escolhida, lista vazia. */
export function filterReleasesByCustomer<T extends CustomerRelease>(releases: T[], cardCode: string): T[] {
  if (!cardCode || !Array.isArray(releases)) {
    return [];
  }
  return releases.filter((release) => release?.CardCode === cardCode);
}

/** Pré-seleção: com exatamente uma liberação possível, ela é escolhida; senão, nenhuma (índice -1). */
export function preselectedReleaseIndex(filteredReleases: unknown[]): number {
  return Array.isArray(filteredReleases) && filteredReleases.length === 1 ? 0 : -1;
}
