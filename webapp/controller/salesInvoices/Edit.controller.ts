import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.salesInvoices
 */
export default class Edit extends BaseController {

	onInit(): void  {	
		this.getRouter().getRoute("salesInvoicesEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
        
		this.clearStates("formSalesInvoice");
    
    const oModel = this.getView().getModel() as ODataModel;
		
		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string };
		if (id != null) {
			const sPath = `/SalesInvoices(${id})`;
			this.bindElement(sPath);
			return;
		}

	}

	async onSave() {
		if (!this.validateForm("formSalesInvoice")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;
		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				oModel.resetChanges(oModel.getUpdateGroupId())
				this.navToDetail();
			}
		} finally {
			this.setBusy(false);
		}
		
	}

	onCancel() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.onNavBack();
	}

  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("salesInvoicesDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
