import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Listas fixas de códigos fiscais usadas pelo cadastro da natureza de operação (NF-e STANDALONE).
 * As mesmas que o servidor aceita (`FiscalCodes` no backend) — um código fora daqui é recusado na
 * gravação. O primeiro item vazio é o "não informado": o servidor grava nulo.
 */
export type FiscalCodeOption = { key: string; text: string };

const empty: FiscalCodeOption = { key: "", text: "" };

/**
 * CST de PIS/COFINS de documento de SAÍDA. Sem o 03 (alíquota por unidade, R$/unidade): o cálculo
 * é percentual sobre a base e o servidor o recusa.
 */
export const PIS_COFINS_OUTGOING_CSTS: FiscalCodeOption[] = [
  empty,
  { key: "01", text: "01 - Alíquota básica" },
  { key: "02", text: "02 - Alíquota diferenciada" },
  { key: "04", text: "04 - Monofásica, revenda a alíquota zero" },
  { key: "05", text: "05 - Substituição tributária" },
  { key: "06", text: "06 - Alíquota zero" },
  { key: "07", text: "07 - Isenta" },
  { key: "08", text: "08 - Sem incidência" },
  { key: "09", text: "09 - Suspensão" },
  { key: "49", text: "49 - Outras operações de saída" },
];

/** CST de PIS/COFINS de documento de ENTRADA. */
export const PIS_COFINS_INCOMING_CSTS: FiscalCodeOption[] = [
  empty,
  { key: "50", text: "50 - Crédito vinculado à receita tributada no mercado interno" },
  { key: "51", text: "51 - Crédito vinculado à receita não tributada no mercado interno" },
  { key: "52", text: "52 - Crédito vinculado à receita de exportação" },
  { key: "53", text: "53 - Crédito vinculado a receitas tributadas e não tributadas" },
  { key: "54", text: "54 - Crédito vinculado a receitas tributadas e de exportação" },
  { key: "55", text: "55 - Crédito vinculado a receitas não tributadas e de exportação" },
  { key: "56", text: "56 - Crédito vinculado a receitas tributadas, não tributadas e de exportação" },
  { key: "60", text: "60 - Crédito presumido, receita tributada no mercado interno" },
  { key: "61", text: "61 - Crédito presumido, receita não tributada no mercado interno" },
  { key: "62", text: "62 - Crédito presumido, receita de exportação" },
  { key: "63", text: "63 - Crédito presumido, receitas tributadas e não tributadas" },
  { key: "64", text: "64 - Crédito presumido, receitas tributadas e de exportação" },
  { key: "65", text: "65 - Crédito presumido, receitas não tributadas e de exportação" },
  { key: "66", text: "66 - Crédito presumido, receitas tributadas, não tributadas e de exportação" },
  { key: "67", text: "67 - Crédito presumido, outras operações" },
  { key: "70", text: "70 - Aquisição sem direito a crédito" },
  { key: "71", text: "71 - Aquisição com isenção" },
  { key: "72", text: "72 - Aquisição com suspensão" },
  { key: "73", text: "73 - Aquisição a alíquota zero" },
  { key: "74", text: "74 - Aquisição sem incidência" },
  { key: "75", text: "75 - Aquisição por substituição tributária" },
  { key: "98", text: "98 - Outras operações de entrada" },
  { key: "99", text: "99 - Outras operações" },
];

/**
 * Publica as listas no modelo `ui` da tela. Precisa rodar ANTES de ligar o contexto da natureza:
 * Select com itens de JSONModel e selectedKey de OData renderiza vazio se os itens chegarem depois.
 */
export function applyFiscalCodeLists(uiModel: JSONModel): void {
  uiModel.setProperty("/pisCofinsOutgoingCsts", PIS_COFINS_OUTGOING_CSTS);
  uiModel.setProperty("/pisCofinsIncomingCsts", PIS_COFINS_INCOMING_CSTS);
}
