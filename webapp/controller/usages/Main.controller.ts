import { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import formatter from "siagrob1/model/formatter";

/**
 * @namespace siagrob1.controller.usages
 */
export default class Main extends BaseController {
  formatter = { ...formatter }

	onInit(): void {
		this.getRouter().getRoute("usages").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		void this.applyErpMode();
		this.onRefresh();
	}

	/**
	 * Em SAPB1 a natureza é cadastrada no SAP: aqui só se configura o efeito. Inicializar
	 * como `false` evita a armadilha do `visible` com binding indefinido, que valeria true e
	 * mostraria Incluir/Deletar por um instante antes da resposta.
	 */
	private async applyErpMode() {
		const uiModel = this.getModel("ui") as JSONModel;
		uiModel.setProperty("/identityEditable", false);

		const systemInfo = await this.getSystemInfo();
		uiModel.setProperty("/identityEditable", systemInfo?.erp !== "SAPB1");
	}

	onRefresh(): void {
		(this.getView().byId("usagesTable").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("Name", FilterOperator.Contains, query),
				new Filter("Description", FilterOperator.Contains, query),
			],
			and: false,
		});

		(this.getView().byId("usagesTable").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

	onCreate() {
		this.navTo("usagesNew");
	}

	onEdit(): void {
		const oTable = this.byId("usagesTable") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0){
      	MessageBox.alert("Selecione um item para editar.");
      return;
    }

		const oContext = oTable.getContextByIndex(i) as Context;

		const sId = oContext.getProperty("Code") as string;
		this.navTo("usagesEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("usagesTable") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0){
      	MessageBox.alert("Selecione um item para deletar.");
      return;
    }

		const oBindingContext = oTable.getContextByIndex(i) as Context;

		if (await confirmDialog("Deseja realmente deletar este registro ?", "Deletar registro ?")) {
			try{
				this.setBusy(true)

				await oBindingContext.delete("$auto");

				await oModel.submitBatch(oModel.getUpdateGroupId())

				if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
					MessageBox.information("Registro deletado.")
				}
			} finally {
				this.setBusy(false)
			}
		}

	}
}
