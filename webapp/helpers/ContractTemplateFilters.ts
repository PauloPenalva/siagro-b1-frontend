/**
 * `$filter` da lista de Modelos de Contrato.
 *
 * String crua e não `sap.ui.model.Filter`, pelo mesmo motivo de `anyOfFilter`: `ContractType` é
 * enum, e o modelo V4 estoura "Unsupported type" ao serializar o literal de um enum num Filter.
 * Como um dos critérios já tem de ser string, os três vão juntos — misturar `.filter()` com
 * `changeParameters({$filter})` funciona, mas deixa a condição espalhada em dois lugares.
 */

/** Literal de texto do OData: a aspa simples é escapada dobrando. */
function literal(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * @param query   texto da busca, comparado com Nome e Título
 * @param scope   `ContractTemplateScope` (`Purchase`/`Sales`/`Both`); vazio = todos
 * @param active  `"Y"`, `"N"` ou vazio; vazio = ativos e inativos
 * @returns a expressão, ou `undefined` quando não há restrição nenhuma —
 *          `changeParameters({ $filter: undefined })` remove o filtro anterior.
 */
export function contractTemplateFilter(query: string, scope: string, active: string): string {
  const conditions: string[] = [];
  const search = (query ?? "").trim();

  // Grupo PARENTIZADO: as condições se unem com `and`, e um `or` solto capturaria as demais.
  if (search) {
    conditions.push(`(contains(Name,${literal(search)}) or contains(Title,${literal(search)}))`);
  }

  if (scope) {
    conditions.push(`ContractType eq ${literal(scope)}`);
  }

  if (active) {
    conditions.push(`Active eq ${active === "Y" ? "true" : "false"}`);
  }

  return conditions.length ? conditions.join(" and ") : undefined;
}
