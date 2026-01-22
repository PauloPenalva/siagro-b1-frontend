/* eslint-disable @typescript-eslint/no-explicit-any */
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.ownershipTransfers
 */
export default class Add extends BaseController {

	onInit(): void  {
		this.getRouter().getRoute("ownershipTransfersNew").attachPatternMatched(() => this.newRouteMatched());
	}

	private newRouteMatched() {
		
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    
		this.resetChanges();

    this.clearStates("ownershipTransferForm");
    
    const oView = this.getView();
		const oModel = this.getView().getModel() as ODataModel;
		const oBinding = oModel.bindList("/OwnershipTransfers")

		const oContext = oBinding.create({
      "TransferStatus": "Open",
      "Quantity": 0
    }, false, false, false);

		oView.setBindingContext(oContext);
	}

	async onSave() {
		
    if (!this.validateForm("ownershipTransferForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				this.navToDetail();
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

  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("ownershipTransfersDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
