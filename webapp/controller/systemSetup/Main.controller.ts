import { SearchField$SearchEvent } from "sap/m/SearchField";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import formatter from "siagrob1/model/formatter";
import Context from "sap/ui/model/odata/v4/Context";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.systemSetup
 */
export default class Main extends BaseController {

  formatter = { ...formatter }

	onInit(): void | undefined {
		this.getRouter().getRoute("systemSetup").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		this.onRefresh();
	}

	onRefresh(): void | undefined {
		(this.getView().byId("systemSetupTable").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void | undefined {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("Code", FilterOperator.Contains, query),
				new Filter("Description", FilterOperator.Contains, query),
 			],
			and: false,
		});

		(this.getView().byId("systemSetupTable").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

	onCreate() {
			this.navTo("systemSetupAdd");
	}

	onEdit(): void {
		const oTable = this.byId("systemSetupTable") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Code") as string;
    
		this.navTo("systemSetupEdit", { id: sId });
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("systemSetupTable") as Table;
		
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
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
