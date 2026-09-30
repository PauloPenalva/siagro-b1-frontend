/**
 * Pré-visualização da minuta e do modelo de contrato.
 *
 * O preview existe para que o que se vê seja o que se imprime: a classe é a mesma de
 * `css/contractDraft.css`, que por sua vez espelha `ContractDraftPdfLayout.Css` no backend.
 */

/** Classe raiz do preview. Definida em `webapp/css/contractDraft.css`. */
export const PREVIEW_CLASS = "siagroContractDraftPreview";

/**
 * Embrulha o corpo HTML num único elemento raiz com a classe do preview.
 *
 * O raiz não é enfeite: `sap.ui.core.HTML` recusa conteúdo que não tenha exatamente um elemento
 * raiz, e o corpo do modelo é uma sequência de irmãos (`<h1>…</h1><p>…</p>`). Corpo vazio devolve
 * a `div` vazia, e não string vazia, para o modelo recém-criado não quebrar o preview.
 */
export function previewHtml(bodyHtml: string): string {
  return `<div class="${PREVIEW_CLASS}">${bodyHtml ?? ""}</div>`;
}

/**
 * Token que o renderizador do backend reconhece. Nome vazio devolve vazio: um `{{}}` no texto
 * seria recusado no salvamento como placeholder desconhecido, e a origem não seria óbvia.
 */
export function placeholderToken(name: string): string {
  const trimmed = (name ?? "").trim();

  return trimmed ? `{{${trimmed}}}` : "";
}
