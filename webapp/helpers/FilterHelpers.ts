import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";

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

/**
 * Unidades de medida que os value helps listam: as liberadas (`Locked = 'N'`) E as sem a flag.
 *
 * Unidade importada ou criada por POST avulso nasce com `Locked` nulo; com o filtro só em `'N'` ela
 * sumia de todas as telas (o campo UM da linha dos documentos vinha vazio na CEAGUI). Não dá para
 * trocar por "diferente de 'Y'": no SQL, `ne` também descarta os nulos.
 */
export function unlockedUnitsOfMeasureFilter(): Filter {
  return new Filter({
    filters: [
      new Filter("Locked", FilterOperator.EQ, "N"),
      new Filter("Locked", FilterOperator.EQ, null),
    ],
    and: false,
  });
}
