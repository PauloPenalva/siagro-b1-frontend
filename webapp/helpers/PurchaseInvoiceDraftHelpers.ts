import { PurchaseInvoiceComplementCandidate } from "siagrob1/types/PurchaseInvoiceComplementCandidate";

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
  /** Complemento de valor próprio (spec 2026-10-14): o item da nota original. Nulo nos demais. (strictNullChecks off.) */
  ComplementedItemKey: string;
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
    ComplementAmount: 0, ComplementedItemKey: null,
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

/**
 * Linha nova do complemento de valor próprio (spec 2026-10-14): herda do item escolhido produto, unidade, natureza e o
 * contrato quando o original tem (o servidor herda de novo e recusa divergência); original sem contrato (D5) = contrato
 * nulo, o operador escolhe pelo value help. Sem quantidade nem preço; o operador digita o valor.
 */
export function complementLineFrom(candidate: PurchaseInvoiceComplementCandidate): InvoiceItemPayload {
  return {
    ...blankItemRow(),
    ItemCode: candidate.ItemCode,
    ItemName: candidate.ItemName,
    UnitOfMeasureCode: candidate.UnitOfMeasure,
    PurchaseContractKey: candidate.PurchaseContractKey,
    UsageCode: candidate.UsageCode,
    UsageName: candidate.UsageName,
    ComplementedItemKey: candidate.ItemKey,
  };
}

/** "DE000005/1": número do documento original e nItem do item (o mesmo formato da recusa C4). */
export function complementedItemLabel(invoiceNumber: string, lineNumber: number): string {
  return `${invoiceNumber ?? ""}/${lineNumber ?? "?"}`;
}

/** Mapa item original → rótulo, a partir da function de candidatos (Detail/Edit). */
export function complementedItemLabels(rows: PurchaseInvoiceComplementCandidate[]): Record<string, string> {
  return (rows ?? []).reduce<Record<string, string>>((labels, row) => {
    labels[row.ItemKey] = complementedItemLabel(row.InvoiceNumber, row.LineNumber);
    return labels;
  }, {});
}

/** Item original para contrato herdado, só dos itens que têm contrato (D5): a linha que aponta um deles trava o contrato. */
export function inheritedContracts(rows: PurchaseInvoiceComplementCandidate[]): Record<string, string> {
  return (rows ?? []).reduce<Record<string, string>>((contracts, row) => {
    if (row.PurchaseContractKey) {
      contracts[row.ItemKey] = row.PurchaseContractKey;
    }
    return contracts;
  }, {});
}

/**
 * Célula "Contrato" editável: tela editável, fora da contra-nota e, na linha do complemento próprio, só quando o item
 * original NÃO tem contrato (D5). Mapa ainda não carregado conta como editável: o servidor recusa a troca (C10).
 */
export function isLineContractEditable(
  editable: boolean, isCounterNote: boolean, complementedItemKey: string, inherited: Record<string, string>,
  usageCode?: number, otherPurchaseUsages?: Record<string, boolean>, otherPurchaseEligible?: boolean
): boolean {
  return editable === true && isCounterNote !== true && !(complementedItemKey && inherited?.[complementedItemKey])
    && !(otherPurchaseEligible === true && isOtherPurchaseUsage(usageCode, otherPurchaseUsages));
}

/**
 * A natureza é de "outra compra" (serviço, consumo, ativo): não exige contrato e gera título. O mapa
 * (`ui>/otherPurchaseUsages`, código → true) só é preenchido em STANDALONE; vazio = tudo é grão, como sempre foi.
 */
export function isOtherPurchaseUsage(usageCode: unknown, otherPurchaseUsages?: Record<string, boolean>): boolean {
  return (typeof usageCode === "number" || typeof usageCode === "string") && otherPurchaseUsages?.[String(usageCode)] === true;
}

/** Só o documento Normal que não é devolução pode ser de outra compra (espelha o servidor). */
export function isOtherPurchaseEligible(invoiceType: unknown, isNfeReturn: unknown): boolean {
  return invoiceType === "Normal" && isNfeReturn !== true;
}

/**
 * Espelha o servidor: o documento é de outra compra quando é Normal e não é devolução, alguma linha tem natureza de
 * outra compra e TODAS as linhas COM natureza são de outra compra (linha sem natureza é ignorada).
 */
export function isOtherPurchaseDocument(
  invoiceType: unknown, isNfeReturn: unknown, usageCodes: unknown[], otherPurchaseUsages?: Record<string, boolean>
): boolean {
  if (!isOtherPurchaseEligible(invoiceType, isNfeReturn)) {
    return false;
  }
  const withUsage = usageCodes.filter((code) => code !== undefined && code !== null && code !== "");
  return withUsage.length > 0 && withUsage.every((code) => isOtherPurchaseUsage(code, otherPurchaseUsages));
}

/** Soma em centavos dos seis valores retidos (ISS, IRRF, INSS, PIS, COFINS, CSLL). */
function sumWithheldCents(values: unknown[]): number {
  return values.reduce<number>((total, value) => total + Math.round(toNumber(value) * 100), 0);
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "Total retido" do cabeçalho: calculado na tela (TotalWithheld é [NotMapped] e não vem no request principal). */
export function formatTotalWithheld(iss: unknown, irrf: unknown, inss: unknown, pis: unknown, cofins: unknown, csll: unknown): string {
  return formatCents(sumWithheldCents([iss, irrf, inss, pis, cofins, csll]));
}

/** "Líquido a pagar": total geral menos Funrural (`netPayable` da barra de totais) menos o total retido. */
export function formatNetPayable(
  iss: unknown, irrf: unknown, inss: unknown, pis: unknown, cofins: unknown, csll: unknown, netBeforeWithholdings: unknown
): string {
  return formatCents(Math.round(toNumber(netBeforeWithholdings) * 100) - sumWithheldCents([iss, irrf, inss, pis, cofins, csll]));
}

/** Natureza das linhas da seção "Títulos gerados": parcela (Firm) ou retenção de imposto. */
const WITHHOLDING_TAX_LABELS: Record<string, string> = {
  Iss: "ISS", Irrf: "IRRF", Inss: "INSS", Pis: "PIS", Cofins: "COFINS", Csll: "CSLL",
};

export function formatGeneratedTitle(nature: string, installment: unknown, taxType: string): string {
  if (nature === "TaxWithholding") {
    return `Retenção ${WITHHOLDING_TAX_LABELS[taxType] ?? ""}`.trim();
  }
  return typeof installment === "number" && installment > 0 ? `Parcela ${installment}` : "Título";
}

/** Coluna "Nota original": o rótulo do item da linha; vazio fora do complemento próprio. */
export function formatComplementedItem(key: string, labels: Record<string, string>): string {
  return key ? labels?.[key] ?? "" : "";
}

/**
 * Coluna "Contrato": o código escolhido na tela (mapa `ui>/contractCodes`, alimentado pelo value help e pela linha do
 * complemento) vale mais que a NAVEGAÇÃO, que não existe na linha nova e fica velha quando o contrato é trocado. Sem
 * chave, vazio (o produto trocado desamarra o contrato).
 */
export function formatContractCode(navigationCode: string, key: string, codes: Record<string, string>): string {
  return key ? codes?.[key] || navigationCode || "" : "";
}

/** Cópia do mapa com a entrada nova: o binding do JSONModel só reavalia quando o objeto muda de identidade. */
export function withEntry(map: Record<string, string>, key: string, value: string): Record<string, string> {
  return key ? { ...(map ?? {}), [key]: value ?? "" } : { ...(map ?? {}) };
}
