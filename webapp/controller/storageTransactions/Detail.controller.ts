import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import MessageToast from "sap/m/MessageToast";

/**
 * @namespace siagrob1.controller.storageTransactions
 */
export default class Detail extends BaseController {

	onInit(): void  {	
		this.getRouter().getRoute("storageTransactionsDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
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
      
		const sPath = `/StorageTransactions(${id})`;
		this.bindElement(sPath);
  }

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("storageTransactionsEdit", {id: oContext.getProperty("Key") as string });
    }
  }


  navToStorageTransactionsList() {
    this.navTo("storageTransactions");
  }

  async onReject() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      throw new Error("");
    }

    if (await DialogHelper.confirmDialog("Cancelar o romaneio ?")) {

      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/StorageTransactionsCancel(...)");
      action.setParameter("Key", oContext.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Romaneio cancelado com sucesso.");
          this.navToStorageTransactionsList()
        })
        .finally(()=> this.setBusy(false))
    }


  }

  async onReverse() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      throw new Error("");
    }

    if (await DialogHelper.confirmDialog("Estornar o romaneio ?")) {

      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/StorageTransactionsReverse(...)");
      const key = oContext.getProperty("Key");
      action.setParameter("Key", key);

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Romaneio estornado com sucesso.");
          this.setData(key)
        })
        .finally(()=> this.setBusy(false))
    }


  }
}
