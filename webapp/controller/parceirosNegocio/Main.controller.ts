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

	onInit(): void {
    this.getRouter().getRoute("parceirosNegocio").attachPatternMatched(() => this.routeMatched())
  }

  private routeMatched() {
    this.onRefresh();
  }

  onRefresh(): void {
    (this.getView().byId("tableParceirosNegocio").getBinding("rows") as ODataListBinding).refresh();
  }

	onSearch(ev: SearchField$SearchEvent): void {
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
			} catch (err) {
				// O backend recusa excluir parceiro em uso (contrato, liberação, romaneio...) com 400 e
				// o motivo na mensagem; sem este catch a recusa sumia sem aviso.
				MessageBox.error((err as Error).message || "Não foi possível excluir o parceiro.");
			} finally {
				this.setBusy(false)
			}
		}

	}
}
