import { SearchField$SearchEvent } from "sap/m/SearchField";
import MessageBox from "sap/m/MessageBox";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import BaseController from "../BaseController";
import { label } from "siagrob1/helpers/DimensionHelpers";
import type { DimensionItem } from "siagrob1/types/AccountingDimension";

/**
 * @namespace siagrob1.controller.distributionRules
 */
export default class Main extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("distributionRules").attachPatternMatched(() => this.onRefresh());
	}

	/** Nome configurado da dimensão; reavalia quando o model `dims` é recarregado. */
	formatDimensionName(dimensionNumber: number, items: DimensionItem[]): string {
		return label({ items }, Number(dimensionNumber)) || String(dimensionNumber ?? "");
	}

	onRefresh(): void {
		(this.byId("distributionRulesTable").getBinding("rows") as ODataListBinding)?.refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void {
		const query = ev.getParameter("query");
		const filter = new Filter({
			filters: [
				new Filter("Name", FilterOperator.Contains, query),
				new Filter("Code", FilterOperator.Contains, query)
			],
			and: false
		});

		(this.byId("distributionRulesTable").getBinding("rows") as ODataListBinding).filter([filter]);
	}

	onCreate(): void {
		this.navTo("distributionRulesNew");
	}

	onEdit(): void {
		const table = this.byId("distributionRulesTable") as Table;
		const index = table.getSelectedIndex();

		if (index < 0) {
			MessageBox.alert("Selecione um item para editar.");
			return;
		}

		const context = table.getContextByIndex(index) as Context;
		this.navTo("distributionRulesEdit", { id: context.getProperty("Code") as string });
	}
}
