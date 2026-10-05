/**
 * Linha enviada no deep-insert do documento de entrada.
 *
 * `Quantity` e `UnitPrice` vão como NÚMERO, não string. Verificado contra o servidor: o
 * desserializador OData recusa Edm.Decimal em string e o POST volta 400 "The entity field is
 * required" — o corpo inteiro falha ao vincular, sem mensagem sobre a linha culpada.
 *
 * As chaves que a tela edita existem desde o início, nem que nulas: sem elas a primeira escolha num
 * value help abre "Must not change a property before it has been read".
 */
export interface InvoiceItemPayload {
  ItemCode: string;
  ItemName: string;
  UnitOfMeasureCode: string;
  Quantity: number;
  UnitPrice: number;
  /** Nulo até o operador amarrar. (strictNullChecks off: `string` já admite null aqui.) */
  SalesInvoiceItemKey: string;
  /** Nulo até o operador amarrar. (strictNullChecks off: `string` já admite null aqui.) */
  PurchaseContractKey: string;
  /** Natureza da linha (modo NF-e). Nula até o operador escolher. */
  UsageCode: number;
  UsageName: string;
  /** nItem na NF-e do fornecedor (importação do XML); nulo na digitação. É o que a devolução referencia. */
  NfeItemNumber: number;
}

/**
 * Converte para número, com 0 quando falta, vem em branco ou não é número.
 *
 * A action de importação devolve Edm.Decimal como string (IEEE754Compatible) e o servidor recusa
 * Edm.Decimal em string no POST, então o rascunho precisa converter antes de enviar.
 */
export function toNumber(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") {
    return 0;
  }
  if (typeof value === "string" && value.trim() === "") {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Item lido do XML importado. Quantidade e preço chegam como string (Edm.Decimal da action). */
export interface ImportedInvoiceItem {
  ItemCode: string;
  ItemName: string;
  UnitOfMeasureCode: string;
  Quantity: number | string;
  UnitPrice: number | string;
  NfeItemNumber?: number;
}

/** Linha em branco do "Incluir Item" e da digitação manual. */
export function blankItemRow(): InvoiceItemPayload {
  return {
    ItemCode: "", ItemName: "", UnitOfMeasureCode: "", Quantity: 0, UnitPrice: 0,
    SalesInvoiceItemKey: null, PurchaseContractKey: null, UsageCode: null, UsageName: null,
    NfeItemNumber: null,
  };
}

/**
 * Linhas com que o rascunho nasce: uma em branco na digitação manual, uma por item do XML importado.
 *
 * Vão para a tabela pelo binding das linhas, e não no `create()` do cabeçalho: a linha aninhada no
 * create do cabeçalho existia no modelo mas a tabela não a mostrava, e o primeiro "Incluir Item"
 * fazia aparecer duas.
 */
export function draftItemRows(items?: ImportedInvoiceItem[]): InvoiceItemPayload[] {
  if (!items) {
    return [blankItemRow()];
  }

  return items.map((item) => ({
    ...blankItemRow(),
    ItemCode: item.ItemCode,
    ItemName: item.ItemName,
    UnitOfMeasureCode: item.UnitOfMeasureCode,
    Quantity: toNumber(item.Quantity),
    UnitPrice: toNumber(item.UnitPrice),
    NfeItemNumber: item.NfeItemNumber ?? null,
  }));
}
