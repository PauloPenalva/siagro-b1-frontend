import { SearchField$SearchEvent } from "sap/m/SearchField";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import BaseController from "../BaseController";

/**
 * Lista de conjuntos de veículos (só STANDALONE).
 * @namespace siagrob1.controller.truckCombinations
 */
export default class Main extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("truckCombinations").attachPatternMatched(() => this.onRefresh());
	}

	private binding(): ODataListBinding {
		return this.byId("tableCombinations").getBinding("rows") as ODataListBinding;
	}

	onRefresh(): void {
		this.binding()?.refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void {
		const query = ev.getParameter("query");
		this.binding().filter(query ? [new Filter({
			filters: [
				new Filter("Code", FilterOperator.Contains, query),
				new Filter("Description", FilterOperator.Contains, query),
				new Filter("TractionTruckCode", FilterOperator.Contains, query),
			],
			and: false,
		})] : []);
	}

	onCreate(): void {
		this.navTo("truckCombinationsNew");
	}

	private selected(action: string): Context | null {
		const table = this.byId("tableCombinations") as Table;
		const i = table.getSelectedIndex();
		if (i < 0) {
			MessageBox.alert(`Selecione um conjunto para ${action}.`);
			return null;
		}
		return table.getContextByIndex(i) as Context;
	}

	onEdit(): void {
		const context = this.selected("editar");
		if (context) {
			this.navTo("truckCombinationsEdit", { id: encodeURIComponent(context.getProperty("Code") as string) });
		}
	}

	async onDelete(): Promise<void> {
		const context = this.selected("excluir");
		if (!context || !(await confirmDialog("Deseja realmente excluir este conjunto?", "Excluir conjunto?"))) {
			return;
		}

		const code = context.getProperty("Code") as string;
		this.setBusy(true);
		try {
			const result = await sendJson("DELETE", `${ServerRoutes.truckCombinations}('${encodeURIComponent(code)}')`);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			MessageToast.show("Conjunto excluído.");
			this.onRefresh();
		} finally {
			this.setBusy(false);
		}
	}
}
