import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.storageInvoices
 */
export default class Detail extends BaseController {

	onInit(): void  {	
		this.getRouter().getRoute("storageInvoicesDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const {id} = ev.getParameter("arguments") as {id: string };
    const uiModel = this.getModel("ui") as JSONModel;

		if (id != null) {

      this.setData(id);

			return;
		}

	}

  private setData(id: string){
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", false);
      
		const sPath = `/StorageInvoices(${id})`;
		this.bindElement(sPath);
  }

  navToStorageInvoicesList() {
    this.navTo("storageInvoices");
  }

  async onReject() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      throw new Error("");
    }

    if (await DialogHelper.confirmDialog("Cancelar fatura de serviços ?")) {

      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/StorageInvoiceCancellation(...)");
      action.setParameter("StorageInvoiceKey", oContext.getProperty("Key"));
      action.setParameter("Reason", "Documento emitido indevidamente.");

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Fatura cancelada com sucesso.");
          this.navToStorageInvoicesList()
        })
        .finally(()=> this.setBusy(false))
    }


  }

   async onClose() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      throw new Error("");
    }

    if (await DialogHelper.confirmDialog("Encerrar fatura de serviços ?")) {

      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/StorageInvoiceClose(...)");
      action.setParameter("Key", oContext.getProperty("Key"));
      
      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Fatura encerrada com sucesso.");
          this.navToStorageInvoicesList()
        })
        .finally(()=> this.setBusy(false))
    }
  }
    
  
  async onReopen() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      throw new Error("");
    }

    if (await DialogHelper.confirmDialog("Reabrir fatura de serviços ?")) {

      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/StorageInvoiceOpen(...)");
      action.setParameter("Key", oContext.getProperty("Key"));
      
      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Fatura reaberta com sucesso.");
          this.navToStorageInvoicesList()
        })
        .finally(()=> this.setBusy(false))
    }

  }

}
