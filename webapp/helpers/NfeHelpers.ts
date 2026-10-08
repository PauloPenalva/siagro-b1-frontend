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
  ImportedCorrections?: number;
};

/** Mensagem do desfecho de emitir/consultar/concluir (o servidor devolve 200 com o desfecho). */
function baseNfeOutcomeMessage(outcome: NfeOutcome): { type: "success" | "warning" | "error"; text: string } {
  const codeAndReason = [outcome.StatusCode, outcome.Reason].filter(Boolean).join(" - ");

  switch (outcome.NfeStatus) {
    case "Authorized":
      // Consulta de autorizada com outro retorno (nem 100 nem 150): mostra o cStat e o motivo (spec §7.4).
      if (outcome.StatusCode && outcome.StatusCode !== "100" && outcome.StatusCode !== "150") {
        return { type: "warning", text: `Situação na SEFAZ: ${codeAndReason}` };
      }
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
    case "Voided":
      return outcome.StatusCode === "102"
        ? { type: "success", text: "Numeração da NF-e inutilizada." }
        : {
          type: "warning",
          text: `Numeração já inutilizada na SEFAZ (${codeAndReason}): o comprovante não está disponível.`,
        };
    default:
      return { type: "warning", text: outcome.Reason ?? "NF-e em processamento." };
  }
}

export function nfeOutcomeMessage(outcome: NfeOutcome): { type: "success" | "warning" | "error"; text: string } {
  const message = baseNfeOutcomeMessage(outcome);
  return outcome.ImportedCorrections > 0
    ? { ...message, text: `${message.text} ${outcome.ImportedCorrections} carta(s) de correção importada(s) da SEFAZ.` }
    : message;
}

/** NF-e já emitida (em processamento, autorizada, rejeitada, denegada ou cancelada). Nulo/None = nunca emitida. */
export function isEmittedNfeStatus(nfeStatus?: string): boolean {
  return !!nfeStatus && nfeStatus !== "None";
}

/**
 * "Informar Nota Fiscal" manual não vale quando a NF-e já foi emitida, no documento Normal do tipo NF-e de filial
 * que emite pelo Siagro, nem na devolução própria (criada pelo Devolver, sai com NF-e do Siagro). O documento Normal
 * do tipo Outro (papel/talão) e as demais devoluções seguem manuais.
 */
export function isManualTaxDocumentBlocked(
  nfeStatus: string, taxLocked: boolean, invoiceType: string, isNfeReturn = false, taxDocumentKind = "Nfe"
): boolean {
  return isEmittedNfeStatus(nfeStatus) || isNfeReturn === true
    || (taxLocked === true && invoiceType === "Normal" && taxDocumentKind !== "Other");
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

/**
 * "Inutilizar numeração": a NF-e rejeitada de um documento já cancelado nunca foi autorizada e o número
 * fica sem uso. Entrada de terceiro (issuerType "ThirdParty") não tem número do Siagro; a saída não informa issuerType.
 */
export function canVoidNfeNumber(nfeStatus?: string, invoiceStatus?: string, issuerType?: string): boolean {
  return invoiceStatus === "Cancelled" && nfeStatus === "Rejected" && (issuerType === undefined || issuerType === "Own");
}

/** Estorno de confirmação: recusado com NF-e em processamento, autorizada ou cancelada. */
export function isReversibleNfeStatus(nfeStatus?: string): boolean {
  return nfeStatus !== "Processing" && nfeStatus !== "Authorized" && nfeStatus !== "Cancelled";
}

export const NFE_CORRECTION_MIN = 15;
export const NFE_CORRECTION_MAX = 1000;

const TYPOGRAPHIC: Record<string, string> = {
  "\u2018": "'", "\u2019": "'", "\u201C": "\"", "\u201D": "\"", "\u2013": "-", "\u2014": "-", "\u2026": "...",
};

// Espelha char.IsWhiteSpace do .NET do servidor (o /\s do JS difere: aceita U+FEFF e ignora U+0085).
// eslint-disable-next-line no-control-regex
const NET_WHITESPACE = /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

/** xCorrecao como o servidor envia: aspas/travessão/reticências em ASCII, todo espaço em branco vira um espaço. */
export function normalizeNfeCorrectionText(text: string): string {
  return Array.from(text ?? "")
    .map((c) => TYPOGRAPHIC[c] ?? (NET_WHITESPACE.test(c) ? " " : c))
    .join("")
    .replace(/ {2,}/g, " ")
    .replace(/^ +| +$/g, "");
}

/** Caracteres que a SEFAZ recusa (fora de U+0020–U+00FF), um de cada, na ordem em que aparecem. */
export function invalidNfeCorrectionChars(text: string): string[] {
  return [...new Set(Array.from(normalizeNfeCorrectionText(text)).filter((c) => c < " " || c > "\u00FF"))];
}

/** Texto da CC-e: 15 a 1000 caracteres depois da normalização e nada fora do Latin-1 — a mesma conta do servidor. */
export function isValidNfeCorrectionText(text: string): boolean {
  const length = normalizeNfeCorrectionText(text).length;
  return length >= NFE_CORRECTION_MIN && length <= NFE_CORRECTION_MAX && invalidNfeCorrectionChars(text).length === 0;
}

/** "Carta de Correção": NF-e autorizada, documento ativo e, na entrada, emissão própria. */
export function canSendNfeCorrection(nfeStatus?: string, invoiceStatus?: string, issuerType?: string): boolean {
  return nfeStatus === "Authorized" && invoiceStatus !== "Cancelled" && (issuerType === undefined || issuerType === "Own");
}

export type FailedNfeCorrection = { key: string; text: string };

/**
 * Texto com que o diálogo da CC-e reabre: o que o usuário digitou e a SEFAZ/servidor recusou (do MESMO documento)
 * vence a última carta registrada, para não perder o texto nem reenviar uma carta antiga.
 */
export function pickNfeCorrectionPrefill(
  failed: FailedNfeCorrection, key: string, previous: string
): string {
  return failed && failed.key === key ? failed.text : previous;
}

/** Título e arquivo do PDF da CC-e no visualizador (mesmo padrão do DANFE). */
export function correctionViewerOptions(doc: DanfeDocument, sequence: number): { title: string; fileName: string } {
  const danfe = danfeViewerOptions(doc);
  const key = (doc.ChaveNFe ?? "").trim();
  return {
    title: danfe.title.replace(/^DANFE/, `Carta de Correção nº ${sequence}`),
    fileName: key ? `${key}-cce-${sequence}.pdf` : `cce-${sequence}.pdf`,
  };
}
