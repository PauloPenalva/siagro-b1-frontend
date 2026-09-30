/**
 * Tipos e rótulos das minutas de contrato (assinatura eletrônica).
 *
 * Os enums do backend (`SiagroB1.Domain.Enums`) entram no EDM pela convenção do
 * ODataConventionModelBuilder e chegam ao cliente como o NOME do membro, não como número —
 * é assim que o resto da tela já consome `SignatureStatus`. Por isso tudo aqui é união de
 * string: um valor novo no backend quebra a compilação no `Record`, que é o comportamento
 * desejado (o rótulo tem de ser escrito junto).
 */

export type ContractDraftStatus =
  | "Draft"
  | "AwaitingSignature"
  | "PartiallySigned"
  | "Signed"
  | "Canceled";

export type ContractDraftType = "Contract" | "Amendment" | "Termination";

export type ContractTemplateScope = "Purchase" | "Sales" | "Both";

export type SignerSide = "Company" | "Partner";

export type SignerStatus = "Pending" | "Signed" | "EmailFailed";

/** Os 13 atos do D4Sign espelhados em `SignatoryRole`. O código `act` do provedor mora no backend. */
export type SignatoryRole =
  | "Sign"
  | "Approve"
  | "Acknowledge"
  | "SignAsParty"
  | "SignAsWitness"
  | "SignAsIntervening"
  | "AcknowledgeReceipt"
  | "SignAsIssuerEndorserGuarantor"
  | "SignAsIssuerEndorserGuarantorSurety"
  | "SignAsSurety"
  | "SignAsPartyAndSurety"
  | "SignAsJointDebtor"
  | "SignAsPartyAndJointDebtor";

export const draftStatusLabel: Record<ContractDraftStatus, string> = {
  Draft: "Rascunho",
  AwaitingSignature: "Aguardando assinatura",
  PartiallySigned: "Parcialmente assinada",
  Signed: "Assinada",
  Canceled: "Cancelada",
};

/** ValueState do ObjectStatus na tabela de minutas. */
export const draftStatusState: Record<
  ContractDraftStatus,
  "None" | "Warning" | "Success" | "Error"
> = {
  Draft: "None",
  AwaitingSignature: "Warning",
  PartiallySigned: "Warning",
  Signed: "Success",
  Canceled: "Error",
};

export const draftTypeLabel: Record<ContractDraftType, string> = {
  Contract: "Contrato",
  Amendment: "Aditivo",
  Termination: "Distrato",
};

export const templateScopeLabel: Record<ContractTemplateScope, string> = {
  Purchase: "Compra",
  Sales: "Venda",
  Both: "Compra e venda",
};

export const signerSideLabel: Record<SignerSide, string> = {
  Company: "Empresa",
  Partner: "Parceiro",
};

export const signerStatusLabel: Record<SignerStatus, string> = {
  Pending: "Pendente",
  Signed: "Assinou",
  EmailFailed: "Falha no e-mail",
};

export const signerStatusState: Record<
  SignerStatus,
  "None" | "Warning" | "Success" | "Error"
> = {
  Pending: "Warning",
  Signed: "Success",
  EmailFailed: "Error",
};

export const signatoryRoleLabel: Record<SignatoryRole, string> = {
  Sign: "Assinar",
  Approve: "Aprovar",
  Acknowledge: "Reconhecer",
  SignAsParty: "Assinar como parte",
  SignAsWitness: "Assinar como testemunha",
  SignAsIntervening: "Assinar como interveniente",
  AcknowledgeReceipt: "Acusar recebimento",
  SignAsIssuerEndorserGuarantor: "Assinar como emissor, endossante e avalista",
  SignAsIssuerEndorserGuarantorSurety:
    "Assinar como emissor, endossante, avalista e fiador",
  SignAsSurety: "Assinar como fiador",
  SignAsPartyAndSurety: "Assinar como parte e fiador",
  SignAsJointDebtor: "Assinar como responsável solidário",
  SignAsPartyAndJointDebtor: "Assinar como parte e responsável solidário",
};

/**
 * Rótulo do papel para célula de tabela. Papel vazio sai vazio; papel que o backend passou a
 * emitir e que ainda não tem tradução sai cru — sumir da tela seria pior que sair em inglês.
 */
export function signatoryRoleText(role: string): string {
  if (!role) return "";

  return signatoryRoleLabel[role as SignatoryRole] ?? role;
}

/**
 * Itens do Select de papel, na ordem dos códigos do provedor (1 a 13). Derivado do mapa de
 * rótulos para não haver duas listas a manter.
 */
export const SIGNATORY_ROLE_OPTIONS: { key: SignatoryRole; text: string }[] = (
  Object.keys(signatoryRoleLabel) as SignatoryRole[]
).map((key) => ({ key, text: signatoryRoleLabel[key] }));

/** Rótulo do escopo para a coluna "Aplica-se a". Mesma regra de `signatoryRoleText`. */
export function templateScopeText(scope: string): string {
  if (!scope) return "";

  return templateScopeLabel[scope as ContractTemplateScope] ?? scope;
}

/** Itens do filtro de escopo, derivados do mapa de rótulos. */
export const TEMPLATE_SCOPE_OPTIONS: { key: ContractTemplateScope; text: string }[] = (
  Object.keys(templateScopeLabel) as ContractTemplateScope[]
).map((key) => ({ key, text: templateScopeLabel[key] }));
