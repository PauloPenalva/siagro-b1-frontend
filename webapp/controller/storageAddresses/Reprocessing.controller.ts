import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";

/**
 * @namespace siagrob1.controller.storageAddresses
 */
export default class Reprocessing extends CommonController {
  
  private _busyDialog: Dialog;

	onInit(): void  {
		this.getRouter().getRoute("storageAddressesReprocessing").attachPatternMatched(() => this.routeMatched());
	}
	private routeMatched() {
		
    this.clearStates("storageAddressesReprocessingForm");
    
    const model = new JSONModel({});
    const view = this.getView();
    
    view.setModel(model, "params");
	}

	async onReprocessing() {
		
    if (!this.validateForm("storageAddressesReprocessingForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    if (!await DialogHelper.confirmDialog("Confirma o reprocessamento do saldo do lote ?"))
      return;

    await this.createBusyDialog();
    const oModel = this.getView().getModel() as ODataModel;

		try {
			const params = this.getView().getModel("params") as JSONModel;
      const action = oModel.bindContext("/StorageAddressesReprocessing(...)");
      action.setParameter("Code", params.getProperty("/Code"));
      action.setParameter("FromDate", params.getProperty("/FromDate"));
      action.setParameter("ToDate", params.getProperty("/ToDate"));

      this._busyDialog?.open();
      await action.invoke();

      MessageToast.show("Lote reprocessado com sucesso.", {
        closeOnBrowserNavigation: false
      });
			
		} finally {
			this._busyDialog?.close();
		}
	}

  private async createBusyDialog() {
      if (!this._busyDialog) {
        this._busyDialog = await Fragment.load({
          name: "siagrob1.view.storageAddresses.fragments.BusyDialog",
          controller: this,
        }) as unknown as Dialog;
        this.getView().addDependent(this._busyDialog);
      }
    }

}
