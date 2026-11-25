/** Linha da lista de NF do SAP vinculáveis, já normalizada (a function devolve objetos simples, não entidades). */
export type LinkableSapInvoice = {
  DocEntry: number,
  DocNum: number,
  /** Texto dd/MM/yyyy, montado da string da data sem passar por `Date` (data pura em UTC recuaria um dia no Brasil). */
  DocDateText: string,
  /** `yyyy-MM-dd` da data: chave de ordenação da coluna Data (o texto dd/MM/yyyy ordenaria errado). */
  DocDateSort: string,
  /** "NF / Série" e "(código) nome" prontos: a tabela filtra/ordena pela própria coluna exibida. */
  InvoiceText: string,
  CustomerText: string,
  CardCode: string,
  CardName: string,
  TaxDocumentNumber: string,
  TaxDocumentSeries: string,
  Quantity: number,
  UnitPrice: number,
  LineTotal: number,
  Cfop: string,
  CarrierCode: string,
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
      DocDateSort: (/^\d{4}-\d{2}-\d{2}/.exec(text("DocDate")) ?? [""])[0],
      InvoiceText: `${text("TaxDocumentNumber")} / ${text("TaxDocumentSeries")}`,
      CustomerText: `(${text("CardCode")}) ${text("CardName")}`,
      CardCode: text("CardCode"),
      CardName: text("CardName"),
      TaxDocumentNumber: text("TaxDocumentNumber"),
      TaxDocumentSeries: text("TaxDocumentSeries"),
      Quantity: num("Quantity"),
      UnitPrice: num("UnitPrice"),
      LineTotal: num("LineTotal"),
      Cfop: text("Cfop"),
      CarrierCode: text("CarrierCode"),
      FreightTerms: text("FreightTerms"),
      AccessKey: text("AccessKey"),
    };
  });
}

/** Pré-seleção: com exatamente uma liberação possível, ela é escolhida; senão, nenhuma (índice -1). */
export function preselectedReleaseIndex(filteredReleases: unknown[]): number {
  return Array.isArray(filteredReleases) && filteredReleases.length === 1 ? 0 : -1;
}

/** Campos só de exibição da liberação: texto do cliente e o preço exibido (comercial, senão o preço em KG). */
export function withReleaseDisplay<T extends { CardCode?: string, CardName?: string, CommercialPrice?: string | number, Price?: string | number }>(
  release: T,
): T & { CustomerText: string, DisplayPrice: number } {
  const raw = release?.CommercialPrice ?? release?.Price;
  const price = typeof raw === "string" ? parseFloat(raw) : raw;
  return {
    ...release,
    CustomerText: `(${release?.CardCode ?? ""}) ${release?.CardName ?? ""}`,
    DisplayPrice: price == null || isNaN(price) ? undefined : price,
  };
}

/** Resposta assíncrona é velha quando o token mudou desde que a requisição saiu. */
export function isStaleRequest(requestToken: number, currentToken: number): boolean {
  return requestToken !== currentToken;
}

type QuantityRow = { Quantity?: number, DocEntry?: number };

/** "Vincular" habilita com ao menos uma NF e a liberação escolhida; a diferença de saldo é avisada pelo servidor. */
export function canLink(invoices: QuantityRow[], hasRelease: boolean): boolean {
  return Array.isArray(invoices) && invoices.length > 0 && hasRelease;
}

/**
 * Liberações oferecidas para a carga: por padrão só as do cliente dela. Com `showOthers`, todas: as do cliente da
 * carga primeiro e as demais marcadas com `OtherCustomer` (o documento de saída nasce com o cliente da NF). Carga
 * sem cliente: lista vazia.
 */
export function releasesForLoad<T extends CustomerRelease>(
  releases: T[], loadCardCode: string, showOthers: boolean,
): Array<T & { OtherCustomer: boolean }> {
  const customer = (loadCardCode ?? "").trim();
  if (!customer || !Array.isArray(releases)) {
    return [];
  }
  const flagged = releases.map((release) => ({ ...release, OtherCustomer: (release?.CardCode ?? "").trim() !== customer }));
  const own = flagged.filter((release) => !release.OtherCustomer);
  return showOthers ? [...own, ...flagged.filter((release) => release.OtherCustomer)] : own;
}

/** Prévia do vínculo (function `ShipmentLoadsGetSapLinkPreview`), com os decimais já convertidos em número. */
export type SapLinkPreview = {
  /** 0 normal, 1 valor divergente, 2 quantidade e valor divergentes. */
  LinkType: number,
  /** Pergunta de confirmação (tipos 1 e 2); nula no tipo 0. */
  Message: string,
  EffectiveQuantity: number,
  InvoiceQuantity: number,
  QuantityDifference: number,
  /** Nulo quando o contrato não tem preço confirmado ou está em dólar. */
  EffectiveValue: number,
  InvoiceValue: number,
  ValueDifference: number,
}

/** Normaliza a resposta da prévia (Edm.Decimal pode vir string; valores nulos continuam nulos). Sem `LinkType`: indefinido. */
export function normalizeLinkPreview(data: unknown): SapLinkPreview {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const raw = data as Raw;
  const linkType = pick(raw, "LinkType");
  if (linkType == null || linkType === "" || isNaN(Number(linkType))) {
    return undefined;
  }
  const num = (name: string) => Number(pick(raw, name) ?? 0);
  const nullable = (name: string) => {
    const value = pick(raw, name);
    return value == null ? null : Number(value);
  };
  const message = pick(raw, "Message");
  return {
    LinkType: Number(linkType),
    Message: message == null ? null : String(message as string),
    EffectiveQuantity: num("EffectiveQuantity"),
    InvoiceQuantity: num("InvoiceQuantity"),
    QuantityDifference: num("QuantityDifference"),
    EffectiveValue: nullable("EffectiveValue"),
    InvoiceValue: num("InvoiceValue"),
    ValueDifference: nullable("ValueDifference"),
  };
}

/** Quantidade em pt-BR com 3 casas (1.234,500). */
export function formatKg(value: number): string {
  return (Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/** Valor em reais no padrão "R$ 59.600,00"; "—" quando nulo ou inválido. */
export function formatMoney(value: number): string {
  if (value == null || isNaN(Number(value))) {
    return "—";
  }
  return `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type LinkedDocument = { key: string, invoiceNumber: string };

/** Normaliza a resposta da action de vínculo: `{ documents: [{ key, invoiceNumber }] }` em camelCase ou PascalCase. */
export function normalizeLinkedDocuments(data: unknown): LinkedDocument[] {
  const raw = (data ?? {}) as Raw;
  const rows = pick(raw, "Documents");
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const doc = (row ?? {}) as Raw;
    const key = pick(doc, "Key");
    const number = pick(doc, "InvoiceNumber");
    return { key: key == null ? "" : String(key as string), invoiceNumber: number == null ? "" : String(number as string) };
  });
}

/** "Desvincular NFs do SAP" só em modo SAP e com a carga já faturada (total ou parcialmente). */
export function canUnlinkSapInvoices(status: string, sapMode: boolean): boolean {
  return sapMode === true && (status === "Invoiced" || status === "PartiallyInvoiced");
}

const LINK_TYPE_TEXTS: Record<string, string> = {
  "0": "Normal", Normal: "Normal",
  "1": "Valor divergente", ValueDivergent: "Valor divergente",
  "2": "Quantidade e valor divergentes", QuantityAndValueDivergent: "Quantidade e valor divergentes",
};

/** Texto do tipo do vínculo; aceita o número ou o nome do enum que o OData devolve. */
export function linkTypeText(linkType: number | string): string {
  return LINK_TYPE_TEXTS[String(linkType)] ?? "";
}

/** Situação da divergência: Open → "Aberta", Voided → "Anulada". */
export function divergenceStatusText(status: string): string {
  return status === "Voided" ? "Anulada" : status === "Open" ? "Aberta" : "";
}
