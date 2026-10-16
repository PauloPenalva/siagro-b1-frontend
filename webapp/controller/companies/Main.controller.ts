import { SearchField$SearchEvent } from "sap/m/SearchField";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.companies
 */
export default class Main extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("companies").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		this.onRefresh();
	}

	onRefresh(): void {
		(this.getView().byId("companiesTable").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("Code", FilterOperator.Contains, query),
				new Filter("CompanyName", FilterOperator.Contains, query),
 			],
			and: false,
		});

		(this.getView().byId("companiesTable").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

	onCreate() {
		this.navTo("companiesNew");
	}

	onEdit(): void {
		const oTable = this.byId("companiesTable") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Code") as string;

		this.navTo("companiesEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("companiesTable") as Table;

    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    const oBindingContext = oTable.getContextByIndex(i) as Context;

		if (await confirmDialog("Deseja realmente excluir esta empresa? O banco de dados dela não é apagado.", "Excluir empresa ?")) {
			try{
				this.setBusy(true)

				await oBindingContext.delete("$auto");

				await oModel.submitBatch(oModel.getUpdateGroupId())

				if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
					MessageBox.information("Empresa excluída.")
				}
			} finally {
				this.setBusy(false)
			}
		}
	}
}
