/**
 * Condição de `$filter` para um filtro de múltipla seleção (MultiComboBox da filterbar).
 *
 * String crua e não `sap.ui.model.Filter`: os campos filtrados assim são enums, e o modelo V4
 * estoura "Unsupported type" ao serializar o literal de um enum.
 *
 * Vários valores viram um grupo de `or` PARENTIZADO — as listas unem os filtros com `and`, e um
 * `or` solto capturaria as demais condições. Nenhum valor marcado devolve `undefined`: sem
 * restrição, a lista traz todos.
 */
export function anyOfFilter(property: string, values: string[]): string {
  if (!values?.length) {
    return undefined;
  }

  const conditions = values.map((value) => `${property} eq '${String(value).replace(/'/g, "''")}'`);

  return conditions.length === 1 ? conditions[0] : `(${conditions.join(" or ")})`;
}
