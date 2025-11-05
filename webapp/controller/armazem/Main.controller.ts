import { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";

/**
 * @namespace siagrob1.controller.armazem
 */
export default class Main extends BaseController {

	onInit(): void | undefined {
		this.getRouter().getRoute("armazens").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		this.onRefresh();
	}

	onRefresh(): void | undefined {
		(this.getView().byId("tableArmazens").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void | undefined {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("Name", FilterOperator.Contains, query),
			],
			and: false,
		});

		(this.getView().byId("tableArmazens").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

	onCreate() {
			this.navTo("armazensNew");
	}

	onEdit(): void {
		const oTable = this.byId("tableArmazens") as Table;
    const oContext = this.getSelectRowContext(oTable);
		
		if (!oContext) {
			MessageBox.alert("Selecione um item para editar.");
			return;
		}
    
		const sId = oContext.getProperty("Key") as string;
		this.navTo("armazensEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableArmazens") as Table;
		const oBindingContext = this.getSelectRowContext(oTable);

		if (!oBindingContext)  {
			MessageBox.alert("Selecione um item para editar.");
			return;
		}

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
