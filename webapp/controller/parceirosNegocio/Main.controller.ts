import { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";

/**
 * @namespace siagrob1.controller.ParceirosNegocio
 */
export default class Main extends BaseController {

	onInit(): void | undefined {

	}

	onSearch(ev: SearchField$SearchEvent): void | undefined {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("CardName", FilterOperator.Contains, query),
			],
			and: false,
		});

		(this.getView().byId("tableParceirosNegocio").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}
}
