import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";

/**
 * Filtros da lista de usuários.
 *
 * A lista abre só com os ativos: em modo SAPB1 ninguém é apagado de USERS - quem some do OUSR
 * (ou pertence a um grupo ignorado, como os usuários de instalação antiga do SAP) apenas fica
 * inativo, e esses nomes poluíam a tela (GAC-1220). "Mostrar inativos" os traz de volta.
 *
 * Os filtros devolvidos são combinados com E pelo binding; a pesquisa, por dentro, usa OU.
 */
export function buildUserListFilters(query: string, showInactive: boolean): Filter[] {
	const filters: Filter[] = [];
	const text = (query ?? "").trim();

	if (text) {
		filters.push(new Filter({
			filters: [
				new Filter("Username", FilterOperator.Contains, text),
				new Filter("FullName", FilterOperator.Contains, text),
				new Filter("Email", FilterOperator.Contains, text),
			],
			and: false,
		}));
	}

	if (!showInactive) {
		filters.push(new Filter("IsActive", FilterOperator.EQ, true));
	}

	return filters;
}
