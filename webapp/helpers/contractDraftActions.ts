import { odataCollection } from "siagrob1/helpers/FetchHelpers";
import { ContractDraftStatus } from "siagrob1/model/contractDrafts";

/**
 * Lógica da seção "Minutas", separada do controller para poder ser provada sem navegador.
 * Compra e venda usam exatamente estas regras — o que muda entre as duas é só o `ContractType`
 * enviado nas actions.
 */

/** A linha como a function `ContractDraftsListByContract` a devolve (só o que a seção usa). */
export type DraftRow = {
  Key?: string;
  ContractCode?: string;
  Sequence?: number;
  DraftType?: string;
  Description?: string;
  Status?: string;
  SignedAttachmentKey?: string;
};

export type DraftButtonState = {
  editBody: boolean;
  remove: boolean;
  pdf: boolean;
  send: boolean;
  cancel: boolean;
  refresh: boolean;
};

const NO_DRAFT: DraftButtonState = {
  editBody: false,
  remove: false,
  pdf: false,
  send: false,
  cancel: false,
  refresh: false,
};

const IN_FLIGHT: ContractDraftStatus[] = ["AwaitingSignature", "PartiallySigned"];

/**
 * Quais botões ficam habilitados para a minuta selecionada.
 *
 * Espelho das guardas do backend — ele recusa de qualquer jeito, isto é cortesia. Situação
 * desconhecida (backend novo, frontend antigo) libera só o PDF: nada que altere a minuta.
 *
 * `Signed` **sem** `SignedAttachmentKey` continua permitindo "Atualizar situação": o backend
 * deixa a minuta assinada sem PDF quando o download no provedor falha, e esta é a única forma
 * de o usuário buscar o documento depois.
 */
export function draftButtonState(draft: DraftRow): DraftButtonState {
  if (!draft) {
    return { ...NO_DRAFT };
  }

  const status = draft.Status as ContractDraftStatus;
  const isDraft = status === "Draft";
  const inFlight = IN_FLIGHT.includes(status);
  const signedWithoutPdf = status === "Signed" && !draft.SignedAttachmentKey;

  return {
    editBody: isDraft,
    remove: isDraft,
    pdf: true,
    send: isDraft,
    cancel: inFlight,
    refresh: inFlight || signedWithoutPdf,
  };
}

/**
 * Linhas da function `ContractDraftsListByContract`.
 *
 * Ela é declarada `ReturnsCollection<ContractDraftDto>()` no EDM, então passa pelo formatador
 * do OData e responde **com** envelope `{ value: [...] }` — `odataCollection` aceita as duas
 * formas e explica a regra. Bindar `rows` direto numa function continua proibido: o
 * `ODataListBinding` não sabe ler o que vem por `fetch`.
 */
export function draftsFromResponse(data: unknown): DraftRow[] {
  return odataCollection<DraftRow>(data);
}

/**
 * Parâmetros do `ContractDraftsUpdate`.
 *
 * `DraftType` e `Description` VÃO junto com o texto, lidos da própria minuta. O servidor hoje
 * preserva o que está gravado quando o parâmetro falta, mas já houve o contrário: omitir
 * `DraftType` rebaixava um Aditivo a Contrato, calado. Mandar o que se sabe é a defesa barata.
 * Campo vazio é omitido, não enviado em branco. O texto não é aparado: espaço entre tags é do
 * editor, e aparar mudaria o documento.
 */
export function updateDraftParameters(
  draft: DraftRow,
  bodyHtml: string
): Record<string, string> {
  const parameters: Record<string, string> = { Key: draft?.Key };

  if (draft?.DraftType) {
    parameters.DraftType = draft.DraftType;
  }

  if (draft?.Description) {
    parameters.Description = draft.Description;
  }

  parameters.BodyHtml = bodyHtml;

  return parameters;
}

/**
 * Parâmetros do `ContractDraftsCreate`.
 *
 * Opcional em branco é OMITIDO, não enviado vazio: `DraftType` é enum no servidor, e `""` não
 * significa "use o default" — significa valor inválido.
 */
export function createDraftParameters(
  contractType: string,
  contractKey: string,
  templateKey: string,
  draftType: string,
  description: string
): Record<string, string> {
  const parameters: Record<string, string> = {
    ContractType: contractType,
    ContractKey: contractKey,
    TemplateKey: templateKey,
  };

  if (draftType?.trim()) {
    parameters.DraftType = draftType.trim();
  }

  if (description?.trim()) {
    parameters.Description = description.trim();
  }

  return parameters;
}

/** Nome sugerido ao salvar o PDF. O contrato vem antes para os arquivos ficarem juntos na pasta. */
export function draftFileName(draft: DraftRow): string {
  const parts = [draft?.ContractCode, "minuta", draft?.Sequence].filter(
    (part) => part !== undefined && part !== null && part !== ""
  );

  return `${parts.join("-")}.pdf`;
}

/**
 * `$filter` do seletor de modelo ao criar uma minuta: os do próprio lado mais os de escopo
 * `Both`, e só os ativos — inativo continua valendo para minutas antigas, mas não origina nova.
 *
 * Texto cru e não `Filter`, pelo mesmo motivo de `anyOfFilter`: `ContractType` é enum e o modelo
 * V4 estoura "Unsupported type" ao serializar o literal de um enum.
 */
export function templatePickerFilter(contractType: string): string {
  return `(ContractType eq '${contractType}' or ContractType eq 'Both') and Active eq true`;
}
