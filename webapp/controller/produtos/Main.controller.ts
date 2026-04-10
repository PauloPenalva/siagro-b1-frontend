import { SearchField$SearchEvent } from "sap/m/SearchField";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { BaseController } from "./BaseController";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";

/**
 * @namespace siagrob1.controller.produtos
 */
export default class Main extends BaseController {

	onInit(): void | undefined {
    this.getRouter().getRoute("produtos").attachPatternMatched(() => this.routeMatched())
  }
  
  private routeMatched() {
    this.onRefresh();
  }

  onRefresh(): void | undefined {
    (this.getView().byId("tableProdutos").getBinding("rows") as ODataListBinding).refresh();
  }
  
	onSearch(ev: SearchField$SearchEvent): void | undefined {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("ItemName", FilterOperator.Contains, query),
				new Filter("ItemCode", FilterOperator.Contains, query),
			],
			and: false,
		});

		(this.getView().byId("tableProdutos").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

  onCreate() {
    this.navTo("produtosAdd");
	}

	onEdit(): void {
		const oTable = this.byId("tableProdutos") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("ItemCode") as string;
    
		this.navTo("produtosEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableProdutos") as Table;
		
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
