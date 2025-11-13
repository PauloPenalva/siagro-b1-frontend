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
import formatter from "siagrob1/model/formatter";

/**
 * @namespace siagrob1.controller.veiculo
 */
export default class Main extends BaseController {
  formatter = { ...formatter }

	onInit(): void | undefined {
		this.getRouter().getRoute("veiculos").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		this.onRefresh();
	}

	onRefresh(): void | undefined {
		(this.getView().byId("tableVeiculo").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void | undefined {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("Model", FilterOperator.Contains, query),
				new Filter("City", FilterOperator.Contains, query),
				new Filter("State/Abbreviation", FilterOperator.Contains, query),
			],
			and: false,
		});

		(this.getView().byId("tableVeiculo").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

	onCreate() {
			this.navTo("veiculosNew");
	}

	onEdit(): void {
		const oTable = this.byId("tableVeiculo") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0){
      	MessageBox.alert("Selecione um item para editar.");
      return;
    }
    
		const oContext = oTable.getContextByIndex(i) as Context;
    
		const sId = oContext.getProperty("Key") as string;
		this.navTo("veiculosEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableVeiculo") as Table;
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
