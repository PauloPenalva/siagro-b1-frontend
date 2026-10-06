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

const DAY = 24 * 60 * 60 * 1000;

/** Dias inteiros até a validade (negativo = vencido), contados por data, sem hora; sem validade devolve undefined. */
export function certificateDaysToExpire(validUntil: string, today: Date): number {
  if (!validUntil) {
    return undefined;
  }

  const end = new Date(validUntil);
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.round((endDay - todayDay) / DAY);
}

/** ObjectStatus do certificado: alerta abaixo de 30 dias (spec §7.2). */
export function certificateState(days: number): "None" | "Error" | "Warning" | "Success" {
  if (days === undefined) {
    return "None";
  }

  if (days < 0) {
    return "Error";
  }

  return days < 30 ? "Warning" : "Success";
}

/** O parâmetro `Environment` da action é Edm.Int32: Production = 1, Homologation = 2. */
export function environmentCode(name: string): number {
  return name === "Production" ? 1 : 2;
}

/** Conteúdo do arquivo em base64, sem o prefixo `data:...;base64,` (mesmo padrão do anexo do contrato). */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export type NfeOutcome = {
  NfeStatus: string;
  InvoiceStatus?: string;
  StatusCode?: string;
  Reason?: string;
  AccessKey?: string;
  ConfirmationError?: string;
  CancellationError?: string;
};

/** Mensagem do desfecho de emitir/consultar/concluir (o servidor devolve 200 com o desfecho). */
export function nfeOutcomeMessage(outcome: NfeOutcome): { type: "success" | "warning" | "error"; text: string } {
  const codeAndReason = [outcome.StatusCode, outcome.Reason].filter(Boolean).join(" - ");

  switch (outcome.NfeStatus) {
    case "Authorized":
      return outcome.ConfirmationError
        ? {
          type: "warning",
          text: `NF-e autorizada, mas a confirmação do documento falhou: ${outcome.ConfirmationError} ` +
            "Corrija e use Concluir confirmação.",
        }
        : {
          type: "success",
          text: outcome.InvoiceStatus === "Confirmed" ? "NF-e autorizada e documento confirmado." : "NF-e autorizada.",
        };
    case "Rejected":
      return { type: "error", text: `NF-e rejeitada: ${codeAndReason}` };
    case "Denied":
      return { type: "error", text: `NF-e denegada: ${codeAndReason}` };
    case "Cancelled":
      return outcome.CancellationError
        ? {
          type: "warning",
          text: `NF-e cancelada na SEFAZ, mas o cancelamento do documento falhou: ${outcome.CancellationError} ` +
            "Corrija e use Concluir cancelamento.",
        }
        : { type: "success", text: "NF-e cancelada e documento cancelado." };
    default:
      return { type: "warning", text: outcome.Reason ?? "NF-e em processamento." };
  }
}

/** NF-e já emitida (em processamento, autorizada, rejeitada, denegada ou cancelada). Nulo/None = nunca emitida. */
export function isEmittedNfeStatus(nfeStatus?: string): boolean {
  return !!nfeStatus && nfeStatus !== "None";
}

/**
 * "Informar Nota Fiscal" manual não vale quando a NF-e já foi emitida, no documento Normal de filial
 * que emite pelo Siagro, nem na devolução própria (criada pelo Devolver, sai com NF-e do Siagro). As
 * demais devoluções seguem manuais: o cliente emite a NF-e dele.
 */
export function isManualTaxDocumentBlocked(
  nfeStatus: string, taxLocked: boolean, invoiceType: string, isNfeReturn = false
): boolean {
  return isEmittedNfeStatus(nfeStatus) || isNfeReturn === true || (taxLocked === true && invoiceType === "Normal");
}

/** Campos do cabeçalho (entrada ou saída) que nomeiam o DANFE. */
export type DanfeDocument = { ChaveNFe: string; TaxDocumentNumber: string; TaxDocumentSeries: string };

/**
 * Título e nome do arquivo do DANFE no visualizador. O número vem com zeros à esquerda ("000000009") e o
 * título mostra "nº 9"; o arquivo segue o padrão do XML (`<chave>-procNFe.xml`) para os dois andarem juntos.
 */
export function danfeViewerOptions(doc: DanfeDocument): { title: string; fileName: string } {
  const number = (doc.TaxDocumentNumber ?? "").trim();
  const series = (doc.TaxDocumentSeries ?? "").trim();
  const key = (doc.ChaveNFe ?? "").trim();

  let title = "DANFE";
  if (number) {
    title += ` – NF-e nº ${number.replace(/^0+(?=\d)/, "")}`;
    if (series) {
      title += ` série ${series}`;
    }
  }

  return { title, fileName: key ? `${key}-danfe.pdf` : "danfe.pdf" };
}

export const NFE_CANCEL_MIN = 15;
export const NFE_CANCEL_MAX = 255;

/** Justificativa do cancelamento (xJust): 15 a 255 caracteres depois do trim, como o servidor conta. */
export function isValidNfeCancelJustification(text: string): boolean {
  const length = (text ?? "").trim().length;
  return length >= NFE_CANCEL_MIN && length <= NFE_CANCEL_MAX;
}

/** "Cancelar" vai pela SEFAZ (com justificativa): NF-e autorizada de documento ainda ativo. */
export function canCancelNfe(nfeStatus?: string, invoiceStatus?: string): boolean {
  return nfeStatus === "Authorized" && invoiceStatus !== "Cancelled";
}

/** NF-e cancelada na SEFAZ e documento ainda ativo: falta a fase local. */
export function needsNfeCancellationCompletion(nfeStatus?: string, invoiceStatus?: string): boolean {
  return nfeStatus === "Cancelled" && invoiceStatus !== "Cancelled";
}

/** Estorno de confirmação: recusado com NF-e em processamento, autorizada ou cancelada. */
export function isReversibleNfeStatus(nfeStatus?: string): boolean {
  return nfeStatus !== "Processing" && nfeStatus !== "Authorized" && nfeStatus !== "Cancelled";
}
