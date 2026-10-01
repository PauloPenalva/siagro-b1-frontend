/** Um campo do catálogo de placeholders, como a function do backend o devolve. */
export type Placeholder = { Name?: string; Description?: string };

/**
 * Normaliza para comparar: minúsculas e **sem acento**.
 *
 * O acento importa aqui porque os dois lados divergem de propósito — o nome do campo é sem
 * acento (`emissao`, é o que se digita no modelo) e a descrição é com (`Data de emissão`).
 * Sem normalizar, quem digita "emissão" não acha o campo e a busca parece quebrada.
 */
function normalize(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Filtra o painel de campos pela busca digitada, olhando nome e descrição.
 *
 * A descrição entra na busca porque é onde está o português: quem procura "CNPJ" não tem como
 * saber que o campo se chama `fornecedor_cnpj`.
 *
 * Busca vazia devolve a lista inteira; busca sem resultado devolve lista vazia (e não a lista
 * toda, que faria a busca parecer ignorada).
 */
export function filterPlaceholders(fields: Placeholder[], query: string): Placeholder[] {
  if (!Array.isArray(fields)) {
    return [];
  }

  const search = normalize(query).trim();

  if (!search) {
    return fields;
  }

  return fields.filter(
    (field) =>
      normalize(field?.Name).includes(search) || normalize(field?.Description).includes(search)
  );
}
