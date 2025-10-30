import { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import formatter from "siagrob1/model/formatter";
import Context from "sap/ui/model/odata/v4/Context";

/**
 * @namespace siagrob1.controller.loteArmazenagem
 */
export default class Main extends BaseController {

  formatter = { ...formatter }

	onInit(): void | undefined {
		this.getRouter().getRoute("lotesArmazenagem").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		this.onRefresh();
	}

	onRefresh(): void | undefined {
		(this.getView().byId("tableLoteArmazenagem").getBinding("rows") as ODataListBinding).refresh();
	}

	onSearch(ev: SearchField$SearchEvent): void | undefined {
		const query = ev.getParameter("query");
		const oFilters = new Filter({
			filters: [
				new Filter("Descricao", FilterOperator.Contains, query),
        new Filter("Produto/Descricao", FilterOperator.Contains, query),
        new Filter("ParceiroNegocio/RazaoSocial", FilterOperator.Contains, query),
        new Filter("ParceiroNegocio/NomeFantasia", FilterOperator.Contains, query),
        new Filter("ParceiroNegocio/Cnpj", FilterOperator.Contains, query),
			],
			and: false,
		});

		(this.getView().byId("tableLoteArmazenagem").getBinding("rows") as ODataListBinding).filter([oFilters]);
	}

	onCreate() {
			this.navTo("lotesArmazenagemNew");
	}

	onEdit(): void {
		const oTable = this.byId("tableLoteArmazenagem") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Id") as string;
    
		this.navTo("lotesArmazenagemEdit", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableLoteArmazenagem") as Table;
		
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
