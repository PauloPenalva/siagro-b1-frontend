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
      CarrierMismatch: pick(raw, "CarrierMismatch") === true,
      FreightTerms: text("FreightTerms"),
      AccessKey: text("AccessKey"),
    };
  });
}

/** Só as liberações de um cliente. Sem cliente, lista vazia. */
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

/**
 * Troca de seleção de NFs: a liberação escolhida só é mantida quando o cliente comum das NFs marcadas não mudou
 * (e a seleção continua de um único cliente e não vazia). Cliente trocado, seleção vazia ou mista: limpa.
 */
export function shouldKeepRelease(previousCustomer: string, invoices: QuantityRow[]): boolean {
  const customer = commonCustomer(invoices);
  return !!customer && customer === previousCustomer;
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

/** Tolerância da comparação da soma das NFs com o saldo da carga (igual à do backend). */
export const QUANTITY_TOLERANCE = 0.001;

type QuantityRow = { Quantity?: number, CardCode?: string, DocEntry?: number };

/** Soma das quantidades das NFs marcadas. */
export function sumQuantity(invoices: QuantityRow[]): number {
  return (invoices ?? []).reduce((total, invoice) => total + (Number(invoice?.Quantity) || 0), 0);
}

/** Cliente comum das NFs marcadas; vazio se nenhuma ou se há mais de um cliente. */
export function commonCustomer(invoices: QuantityRow[]): string {
  const codes = new Set((invoices ?? []).map((invoice) => invoice?.CardCode ?? ""));
  return codes.size === 1 ? [...codes][0] : "";
}

/** Há NFs marcadas de mais de um cliente. */
export function hasMixedCustomers(invoices: QuantityRow[]): boolean {
  return new Set((invoices ?? []).map((invoice) => invoice?.CardCode ?? "")).size > 1;
}

/** Soma igual ao saldo, dentro da tolerância. */
export function matchesAvailable(sum: number, available: number): boolean {
  return Math.abs((Number(sum) || 0) - (Number(available) || 0)) <= QUANTITY_TOLERANCE + 1e-9;
}

/** Soma maior que o saldo (além da tolerância): a lista traz NFs acima do saldo para o usuário notar o erro. */
export function exceedsAvailable(sum: number, available: number): boolean {
  return (Number(sum) || 0) - (Number(available) || 0) > QUANTITY_TOLERANCE + 1e-9;
}

/**
 * "Vincular" habilita com NF marcada, um único cliente, liberação escolhida e a soma IGUAL ao saldo (±0,001).
 * Soma menor ou maior que o saldo mantém desabilitado (regra confirmada pelo dono do produto).
 */
export function canLink(invoices: QuantityRow[], available: number, hasRelease: boolean): boolean {
  return Array.isArray(invoices) && invoices.length > 0 && !!commonCustomer(invoices) && hasRelease
    && matchesAvailable(sumQuantity(invoices), available);
}

/**
 * Liberações oferecidas para as NFs marcadas (nenhuma NF ou clientes misturados: lista vazia). Entram TODAS: por
 * instrução da trading o contrato é feito num cliente e o faturamento sai em outro. As do cliente da NF vêm
 * primeiro; as demais vêm marcadas com `OtherCustomer` (o documento de saída nasce com o cliente da NF).
 */
export function releasesForInvoices<T extends CustomerRelease>(
  releases: T[], invoices: QuantityRow[],
): Array<T & { OtherCustomer: boolean }> {
  const customer = commonCustomer(invoices);
  if (!customer || !Array.isArray(releases)) {
    return [];
  }
  const flagged = releases.map((release) => ({ ...release, OtherCustomer: release?.CardCode !== customer }));
  return [...flagged.filter((release) => !release.OtherCustomer), ...flagged.filter((release) => release.OtherCustomer)];
}

/** Quantidade em pt-BR com 3 casas (1.234,500). */
export function formatKg(value: number): string {
  return (Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/** Texto do rodapé da tabela de NFs. */
export function selectionSummaryText(sum: number, available: number): string {
  return `Selecionado: ${formatKg(sum)} kg de ${formatKg(available)} kg`;
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
