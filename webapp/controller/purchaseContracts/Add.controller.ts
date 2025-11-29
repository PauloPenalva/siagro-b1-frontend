/* eslint-disable @typescript-eslint/no-explicit-any */
import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import BaseController from "./BaseController";

/**
 * @namespace siagrob1.controller.purchaseContracts
 */
export default class Add extends BaseController {

	onInit(): void | undefined {
		this.getRouter().getRoute("purchaseContractsNew").attachPatternMatched(() => this.newRouteMatched());
	}

	private newRouteMatched() {
		
		this.resetChanges();

    this.clearStates("formPurchaseContracts");
    
    const oView = this.getView();
		const oModel = this.getView().getModel() as ODataModel;
		const oBinding = oModel.bindList("/PurchaseContracts")

		const oContext = oBinding.create({
      "Type": "Fixed",
      "Status": "Draft",
      "FreightTerms": "None"
    }, false, false, false);

		oView.setBindingContext(oContext);
	}

	async onSave() {
		
    if (!this.validateForm("formPurchaseContracts")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				MessageToast.show("Dados salvos com sucesso.", {
					closeOnBrowserNavigation: false
				});
			}
		} finally {
			this.setBusy(false);
		}
	}

  private resetChanges(){
    const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}
  }

	onCancel() {
    this.resetChanges();
    this.onNavBack();
	}

}
