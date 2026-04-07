import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.systemSetup
 */
export default class Add extends BaseController {

	onInit(): void | undefined {
		this.getRouter().getRoute("systemSetupAdd").attachPatternMatched(() => this.newRouteMatched());
	}

	private newRouteMatched() {
		
    this.clearStates("systemSetupForm");
    
    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/SystemSetup")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const oContext = oBinding.create({
      "DefaultCurrency": "",
      "IsActive": false,
    }, false, false, false);

		oView.setBindingContext(oContext);
	}

	async onSave() {
		
    if (!this.validateForm("systemSetupForm")) {
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

	onCancel() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.onNavBack();
	}

}
