import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * @namespace siagrob1.controller.salesInvoices
 */
export default class Detail extends BaseController {

	onInit(): void  {	
		this.getRouter().getRoute("salesInvoicesDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const {id} = ev.getParameter("arguments") as {id: string };
    const uiModel = this.getModel("ui") as JSONModel;

		if (id != null) {

      uiModel.setProperty("/editable", false);
      
			const sPath = `/SalesInvoices(${id})`;
			this.bindElement(sPath);

			return;
		}

	}

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("salesInvoicesEdit", {id: oContext.getProperty("Key") as string });
    }
  }

  async onConfirm() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.error("Contexto inválido.")
      return;
    }

    if (await DialogHelper.confirmDialog("Confirmar documento de saída ?")) {
      this.confirmAction(ctx);
    }
  }

  private confirmAction(ctx:Context) {
    const action = (ctx.getModel() as ODataModel).bindContext("/SalesInvoicesConfirm(...)");
    action.setParameter("Key", ctx.getProperty("Key"));

    this.setBusy(false);
    action.invoke()
      .then(() => {
        MessageToast.show("Documento de saída confirmado com sucesso.");
        this.navToSalesInvoices();
      })
      .finally(() => this.setBusy(false));
  }

  private navToSalesInvoices(){
    this.navTo("salesInvoices");
  }
}
