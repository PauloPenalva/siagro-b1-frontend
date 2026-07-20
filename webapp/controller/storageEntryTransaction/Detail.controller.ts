import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageToast from "sap/m/MessageToast";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { BaseController } from "./BaseController";

/**
 * Visualização somente-leitura de uma entrada em armazenagem própria, com o
 * estorno. O estorno vive aqui — e não na lista — para que a operação
 * destrutiva só aconteça depois de o usuário conferir o par de romaneios.
 *
 * @namespace siagrob1.controller.storageEntryTransaction
 */
export default class Detail extends BaseController {

  onInit(): void {
    this.getRouter()
      .getRoute("storageEntryTransactionDetail")
      .attachPatternMatched((ev) => this.detailRouteMatched(ev));
  }

  private detailRouteMatched(ev: Route$MatchedEvent) {
    const { id } = ev.getParameter("arguments") as { id: string };

    if (id != null) {
      this.setData(id);
    }
  }

  private setData(id: string) {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", false);

    // Sem parameters: o model tem autoExpandSelect, então o $expand das
    // navegações sai dos próprios bindings da view.
    this.bindElement(`/StorageEntryTransactions(${id})`);
  }

  onNavToList() {
    this.navTo("storageEntryTransaction");
  }

  /** Estorna a entrada: devolve o volume ao contrato e tira o produto do lote. */
  async onReverse() {
    const oContext = this.getView().getBindingContext() as Context;

    if (!oContext) {
      return;
    }

    if (!await DialogHelper.confirmDialog("Estornar esta entrada em armazenagem ?")) {
      return;
    }

    const model = this.getModel() as ODataModel;
    const action = model.bindContext("/StorageEntryTransactionsCancel(...)");
    const key = oContext.getProperty("Key") as string;
    action.setParameter("Key", key);

    this.setBusy(true);
    void action.invoke()
      .then(() => {
        MessageToast.show("Entrada estornada com sucesso.");
        // Re-binda para a tela refletir o novo status — e o botão Estornar
        // se desabilitar sozinho pelo expression binding.
        this.setData(key);
      })
      .finally(() => this.setBusy(false));
  }
}
