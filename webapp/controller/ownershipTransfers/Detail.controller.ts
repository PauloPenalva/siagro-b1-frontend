import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import MessageToast from "sap/m/MessageToast";

/**
 * @namespace siagrob1.controller.ownershipTransfers
 */
export default class Detail extends BaseController {

	onInit(): void  {	
		this.getRouter().getRoute("ownershipTransfersDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const {id} = ev.getParameter("arguments") as {id: string };
    const uiModel = this.getModel("ui") as JSONModel;

		if (id != null) {

      uiModel.setProperty("/editable", false);
      
			const sPath = `/OwnershipTransfers(${id})`;
			this.bindElement(sPath);

			return;
		}

	}

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("ownershipTransfersEdit", {id: oContext.getProperty("Key") as string });
    }
  }

  navToOwnershipTransfersList() {
    this.navTo("ownershipTransfers");
  }

  async onConfirm() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      throw new Error("");
    }

    if (await DialogHelper.confirmDialog("Confirmar transferencia de propriedade ?")) {

      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/OwnershipTransfersConfirm(...)");
      action.setParameter("Key", oContext.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Transferencia confirmada com sucesso.");
          this.navToOwnershipTransfersList()
        })
        .finally(()=> this.setBusy(false))
    }
  }

  async onReject() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      throw new Error("");
    }

    if (await DialogHelper.confirmDialog("Cancelar a transferencia ?")) {

      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/OwnershipTransfersCancel(...)");
      action.setParameter("Key", oContext.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Transferencia cancelada com sucesso.");
          this.navToOwnershipTransfersList()
        })
        .finally(()=> this.setBusy(false))
    }
  }
}
