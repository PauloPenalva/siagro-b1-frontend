/**
 * Regras de tela da NF-e STANDALONE, puras para poderem ser testadas sem view.
 * As listas são as mesmas que o servidor aceita (`PaymentMeansCodes`, `PaymentStartRule`).
 */
export type Option = { key: string; text: string };

export const PAYMENT_MEANS: Option[] = [
  { key: "01", text: "01 - Dinheiro" },
  { key: "03", text: "03 - Cartão de crédito" },
  { key: "04", text: "04 - Cartão de débito" },
  { key: "15", text: "15 - Boleto bancário" },
  { key: "16", text: "16 - Depósito bancário" },
  { key: "17", text: "17 - PIX" },
  { key: "18", text: "18 - Transferência bancária" },
  { key: "90", text: "90 - Sem pagamento" },
  { key: "99", text: "99 - Outros" },
];

export const PAYMENT_START_RULES: Option[] = [
  { key: "IssueDate", text: "Data de emissão" },
  { key: "NextMonth", text: "Fora o mês (1º dia do mês seguinte)" },
];

const START_RULE_CODES: Record<string, number> = { IssueDate: 1, NextMonth: 2 };

/**
 * URL da função de prévia. O enum vai pelo número (o parâmetro é Edm.Int32) e o total com ponto
 * decimal; os dias vão entre aspas e codificados (a vírgula faz parte do valor).
 */
export function paymentPreviewUrl(
  days: string, startRule: string, paymentMeans: string, total: number, issueDate: string
): string {
  const safeTotal = Number.isFinite(total) ? total : 0;
  return "/odata/PaymentConditionsPreview(" +
    `Days='${encodeURIComponent(days ?? "")}',` +
    `StartRule=${START_RULE_CODES[startRule] ?? 1},` +
    `PaymentMeans='${encodeURIComponent(paymentMeans ?? "")}',` +
    `Total=${safeTotal},` +
    `IssueDate=${issueDate})`;
}
