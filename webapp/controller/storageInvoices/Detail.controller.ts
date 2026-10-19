import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import ColumnListItem from "sap/m/ColumnListItem";
import Event from "sap/ui/base/Event";
import ODataContextBinding from "sap/ui/model/odata/v4/ODataContextBinding";

/**
 * @namespace siagrob1.controller.storageInvoices
 */
export default class Detail extends BaseController {

	onInit(): void  {	
		this.getRouter().getRoute("storageInvoicesDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
    this.resetDocNumberMode();
		const {id} = ev.getParameter("arguments") as {id: string };

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
    // A situação muda por documentos e títulos: relê o cabeçalho ao voltar para a tela.
    (this.getView().getElementBinding() as ODataContextBinding)?.refresh();
    void this.loadBilling(id);
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

  /** Documentos, títulos e saldo da fatura (função StorageInvoiceBilling). */
  private async loadBilling(id: string) {
    const model = new JSONModel({ Balance: 0, BilledAmount: 0, Documents: [], Receivables: [] });
    this.getView().setModel(model, "billing");
    const result = await sendJson("GET", `/odata/StorageInvoiceBilling(Key=${id})`);
    if (result.ok) model.setData(result.data as object);
  }

  /** Spec 2026-10-19: abre o documento de saída já com o parceiro e o vínculo da fatura. */
  onBill() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) return;
    this.navTo("salesInvoicesAdd", { "?query": { storageInvoice: ctx.getProperty("Key") as string } });
  }

  onOpenDocument(ev: Event) {
    const item = ev.getSource<ColumnListItem>();
    const key = item.getBindingContext("billing").getProperty("Key") as string;
    this.navTo("salesInvoicesDetail", { id: key });
  }

}
