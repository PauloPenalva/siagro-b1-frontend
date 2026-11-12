/**
 * GAC-1196: cadastro inativo no SAP não pode ser ESCOLHIDO num documento, mas continua
 * aparecendo onde o value help serve de FILTRO (barra de filtros das listas e parâmetros de
 * relatório) — senão não haveria como consultar o histórico de um parceiro inativado.
 *
 * `Inactive` existe nos dois modos; em STANDALONE vem sempre `false`, então o filtro é inócuo.
 */

/** Diálogos cuja entidade expõe `Inactive` (parceiro, armazém e produto). */
const ACTIVE_ONLY_DIALOGS = new Set([
	"BusinessPartnersSelectDialog",
	"SuppliersSelectDialog",
	"CostumersSelectDialog",
	"WarehousesSelectDialog",
	"ItemsSelectDialog"
]);

export const ACTIVE_RECORDS_FILTER = "Inactive eq false";

export function isActiveOnlyDialog(dialogName: string): boolean {
	return ACTIVE_ONLY_DIALOGS.has(dialogName);
}

/**
 * `$filter` estático da abertura. Devolve `undefined` quando não há nada a filtrar — para os
 * diálogos desta lista isso LIMPA o filtro deixado por uma abertura anterior, porque o diálogo é
 * reaproveitado por (view, fragmento).
 */
export function activeRecordsStaticFilter(
	dialogName: string, staticFilter: string, includeInactive: boolean
): string {
	if (!isActiveOnlyDialog(dialogName) || includeInactive) {
		return staticFilter;
	}

	return staticFilter ? `(${staticFilter}) and ${ACTIVE_RECORDS_FILTER}` : ACTIVE_RECORDS_FILTER;
}

/**
 * O campo é de consulta (filtro), e não de um documento?
 *
 * - dentro de uma FilterBar: filtro de lista;
 * - tela de relatório (`view.reports.*`): parâmetro de relatório;
 * - tela de lista (`*.Main`) fora de um Dialog: os campos soltos são filtros; o que a lista
 *   edita ou cria passa por um Dialog, e ali vale a regra do documento.
 *
 * `ancestorTypes` são os nomes das classes dos controles pais do campo, do mais próximo ao
 * mais distante.
 */
export function isQueryField(viewName: string, ancestorTypes: string[]): boolean {
	if (ancestorTypes.some((type) => type.endsWith(".FilterBar"))) {
		return true;
	}

	if (viewName.includes(".view.reports.")) {
		return true;
	}

	return viewName.endsWith(".Main") && !ancestorTypes.includes("sap.m.Dialog");
}
