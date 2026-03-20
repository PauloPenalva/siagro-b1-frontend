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
export default class DailyCalculation extends CommonController {
  
  private _busyDialog: Dialog;

	onInit(): void  {
		this.getRouter().getRoute("storageAddressesDailyCalculation").attachPatternMatched(() => this.routeMatched());
	}
	private routeMatched() {
		
    this.clearStates("storageAddressesDailyCalculationForm");
    
    const model = new JSONModel({});
    const view = this.getView();
    
    view.setModel(model, "params");
	}

	async onReprocessing() {
		
    if (!this.validateForm("storageAddressesDailyCalculationForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    if (!await DialogHelper.confirmDialog("Confirma o reprocessamento do calculo diário ?"))
      return;

    await this.createBusyDialog();
    const oModel = this.getView().getModel() as ODataModel;

		try {
			const params = this.getView().getModel("params") as JSONModel;
      const action = oModel.bindContext("/StorageAddressesDailyCalculationJob(...)");
      action.setParameter("ProcessingDate", params.getProperty("/ProcessingDate"));
      
      this._busyDialog?.open();
      await action.invoke();

      MessageToast.show("Calculo diário reprocessado com sucesso.", {
        closeOnBrowserNavigation: false
      });
			
		} finally {
			this._busyDialog?.close();
		}
	}

  private async createBusyDialog() {
      if (!this._busyDialog) {
        this._busyDialog = await Fragment.load({
          name: "siagrob1.view.storageAddresses.fragments.DailyCalculationBusyDialog",
          controller: this,
        }) as unknown as Dialog;
        this.getView().addDependent(this._busyDialog);
      }
    }

}
