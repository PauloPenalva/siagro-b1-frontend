import CommonController from "../common/CommonController";
import Fragment from "sap/ui/core/Fragment";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import TableSelectDialog, { TableSelectDialog$ConfirmEvent } from "sap/m/TableSelectDialog";
import Context from "sap/ui/model/odata/v4/Context";
import RequestModel from "siagrob1/model/RequestModel";

/**
 * @namespace siagrob1.controller.storageEntryTransaction
 */
export abstract class BaseController extends CommonController {
  private _lotDialog: TableSelectDialog;

  /**
   * Abre o diálogo de lotes ABERTOS do produto e resolve com os contextos escolhidos.
   *
   * Usa `StorageAddressesListOpenedByItem` — o value help genérico de StorageAddresses
   * não filtra por produto nem por lote aberto, e aqui as duas coisas importam.
   *
   * Os dados vão para o model "lots", e não "viewModel": este último carrega o
   * formulário da tela e seria sobrescrito.
   */
  protected async openLotsDialog(itemCode: string): Promise<Context[]> {
    if (!itemCode) {
      MessageBox.warning("Selecione o produto.");
      return [];
    }

    const view = this.getView();

    this._lotDialog ??= await Fragment.load({
      name: "siagrob1.view.storageEntryTransaction.fragments.StorageAddressesBalanceDialog",
      controller: this,
      id: view.getId(),
    }) as TableSelectDialog;

    if (view.indexOfDependent(this._lotDialog) < 0) {
      view.addDependent(this._lotDialog);
    }

    // Registrado antes do open para não perder o confirm; a promise só é
    // aguardada no fim. O detach evita acumular handlers a cada abertura.
    const pSelection = new Promise<Context[]>((resolve) => {
      const fnConfirm = (oEvent: TableSelectDialog$ConfirmEvent) => {
        this._lotDialog.detachConfirm(fnConfirm);
        resolve(oEvent.getParameter("selectedContexts") as Context[]);
      };

      this._lotDialog.attachConfirm(fnConfirm);
    });

    const requestModel = new RequestModel();

    this.setBusy(true);
    try {
      const results = await requestModel.get<object>(
        `${this.api.storageAddressesBalance}(Code='${itemCode}')`
      );

      const lotsModel = this.getModel("lots") as JSONModel;
      lotsModel.setData(results);
    } finally {
      this.setBusy(false);
    }

    this._lotDialog.open(undefined);

    return pSelection;
  }
}
