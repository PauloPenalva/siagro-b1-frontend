import { SearchField$SearchEvent } from "sap/m/SearchField";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";

/**
 * @namespace siagrob1.controller.ParceirosNegocio
 */
export default class Main extends BaseController {

  formatter = formatter;

	onInit(): void | undefined {
    this.getRouter().getRoute("parceirosNegocio").attachPatternMatched(() => this.routeMatched())
  }

  private routeMatched() {
    this.onRefresh();
  }

  onRefresh(): void | undefined {
    (this.getView().byId("tableParceirosNegocio").getBinding("rows") as ODataListBinding).refresh();
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

  onCreate() {
			this.navTo("parceirosNegocioAdd");
	}

	onEdit(): void {
		const oTable = this.byId("tableParceirosNegocio") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("CardCode") as string;
    
		this.navTo("parceirosNegocioEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableParceirosNegocio") as Table;
		
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
