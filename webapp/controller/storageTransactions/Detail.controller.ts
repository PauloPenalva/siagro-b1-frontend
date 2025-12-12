import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";

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

      uiModel.setProperty("/editable", false);
      
			const sPath = `/StorageTransactions(${id})`;
			this.bindElement(sPath);

			return;
		}

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
}
