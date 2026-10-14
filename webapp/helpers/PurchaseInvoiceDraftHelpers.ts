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
  /** Natureza da linha (entrada própria e terceiro Normal, as que calculam tributos). Nula até o operador escolher. */
  UsageCode: number;
  UsageName: string;
  /** nItem na NF-e do fornecedor (importação do XML); nulo na digitação. É o que a devolução referencia. */
  NfeItemNumber: number;
  /** Frete, seguro, desconto e outras despesas da linha (spec 2026-10-05): 0 até o operador informar ou o XML trazer. */
  FreightValue: number;
  InsuranceValue: number;
  DiscountValue: number;
  OtherExpensesValue: number;
  /** Valor do complemento (documento do tipo Complemento de valor, spec D11): 0 nos demais tipos. */
  ComplementAmount: number;
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
  /** Retorno de depósito (spec backend 2026-10-10): a linha da remessa casada pelo XML; o número só serve para exibir. */
  SalesInvoiceItemKey?: string;
  RemittanceNumber?: string;
  /** Frete, seguro, desconto e outras despesas do `det/prod` (Edm.Decimal da action, em string); ausentes = 0. */
  FreightValue?: number | string;
  InsuranceValue?: number | string;
  DiscountValue?: number | string;
  OtherExpensesValue?: number | string;
  /** Complemento de valor (finNFe=2): valor da linha, sem quantidade nem preço (Edm.Decimal da action, em string). */
  ComplementAmount?: number | string;
}

/**
 * Número da remessa de cada linha do XML, por nItem. Fica só no cliente (modelo `ui`): o POST não o leva, porque quem grava
 * é o SalesInvoiceItemKey; serve para a coluna "Remessa" não parecer vazia antes de salvar.
 */
export function remittanceNumbersByItem(items?: ImportedInvoiceItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const item of items ?? []) {
    if (item.NfeItemNumber != null && item.RemittanceNumber) {
      map[String(item.NfeItemNumber)] = item.RemittanceNumber;
    }
  }
  return map;
}

/** Texto da coluna "Remessa": o da navegação (documento salvo) ou, antes de salvar, o número vindo do XML. */
export function formatRemittanceNumber(
  navigationText?: string, navigationInvoiceNumber?: string, nfeItemNumber?: number, numbers?: Record<string, string>
): string {
  return navigationText || navigationInvoiceNumber || (nfeItemNumber != null ? numbers?.[String(nfeItemNumber)] : "") || "";
}

/**
 * Unidade sugerida ao escolher o produto da linha (B7): a que o operador já escolheu NUNCA é trocada; senão a unidade
 * comercial do complemento do produto e, sem ela, a unidade padrão do sistema. Vazio quando nada se aplica.
 */
export function suggestedUnitOfMeasure(current?: string, commercial?: string, systemDefault?: string): string {
  return (current ?? "").trim() || (commercial ?? "").trim() || (systemDefault ?? "").trim();
}

/**
 * Decide se a sugestão de unidade (lida de forma assíncrona) ainda vale e qual unidade gravar; vazio = não gravar.
 *
 * - Descarta o resultado se o produto da linha mudou enquanto o complemento era lido (resposta velha).
 * - Só substitui a unidade quando ela está vazia OU ainda é a última que foi SUGERIDA (o operador não mexeu): a que ele
 *   escolheu à mão nunca é sobrescrita, mas uma sugestão é renovada quando ele troca o produto.
 */
export function unitSuggestionToApply(
  requestedItemCode: string, currentItemCode: string, currentUnit: string, lastSuggested: string,
  commercial?: string, systemDefault?: string
): string {
  if (requestedItemCode !== currentItemCode) {
    return "";
  }
  const unit = (currentUnit ?? "").trim();
  if (unit && unit !== (lastSuggested ?? "")) {
    return "";
  }
  return suggestedUnitOfMeasure("", commercial, systemDefault);
}

/**
 * Mensagem do Save quando há linha sem unidade de medida (o servidor recusa do mesmo jeito): nomeia a primeira, na
 * ordem da grade (nº = posição, a partir de 1). Vazio quando todas têm unidade. Complemento de valor não tem
 * quantidade, então fica fora.
 */
export function missingUnitOfMeasureMessage(lines: { ItemCode?: string, UnitOfMeasureCode?: string }[], invoiceType?: string): string {
  if (invoiceType === "ValueComplement") {
    return "";
  }
  const index = lines.findIndex((line) => !(line.UnitOfMeasureCode ?? "").trim());
  return index < 0 ? "" : `Informe a unidade de medida da linha ${index + 1} (${(lines[index].ItemCode ?? "").trim() || "sem produto"}).`;
}

/** Linha em branco do "Incluir Item" e da digitação manual. */
export function blankItemRow(): InvoiceItemPayload {
  return {
    ItemCode: "", ItemName: "", UnitOfMeasureCode: "", Quantity: 0, UnitPrice: 0,
    SalesInvoiceItemKey: null, PurchaseContractKey: null, UsageCode: null, UsageName: null,
    NfeItemNumber: null, FreightValue: 0, InsuranceValue: 0, DiscountValue: 0, OtherExpensesValue: 0,
    ComplementAmount: 0,
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
    SalesInvoiceItemKey: item.SalesInvoiceItemKey ?? null,
    FreightValue: toNumber(item.FreightValue),
    InsuranceValue: toNumber(item.InsuranceValue),
    DiscountValue: toNumber(item.DiscountValue),
    OtherExpensesValue: toNumber(item.OtherExpensesValue),
    ComplementAmount: toNumber(item.ComplementAmount),
  }));
}
