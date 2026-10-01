/**
 * Token de placeholder do modelo de contrato.
 *
 * Vivia junto com o embrulho da pré-visualização; a pré-visualização saiu da tela e levou o
 * resto do arquivo junto, porque o editor já mostra o texto com a tipografia do PDF.
 */

/**
 * Token que o renderizador do backend reconhece. Nome vazio devolve vazio: um `{{}}` no texto
 * seria recusado no salvamento como placeholder desconhecido, e a origem não seria óbvia.
 */
export function placeholderToken(name: string): string {
  const trimmed = (name ?? "").trim();

  return trimmed ? `{{${trimmed}}}` : "";
}
