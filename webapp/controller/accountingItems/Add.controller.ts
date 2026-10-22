import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import BaseController from "../BaseController";

/**
 * @namespace siagrob1.controller.accountingItems
 */
export default class Add extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("accountingItemsNew").attachPatternMatched(() => this.newRouteMatched());
	}

	private newRouteMatched() {

    (this.getModel("ui") as JSONModel).setProperty("/codeEditable", true);
    this.clearStates("accountingItemsForm");

    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/AccountingItems")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const oContext = oBinding.create({
			Code: null, Name: null, Inactive: false,
			Class: "Analytic", ParentCode: null, ValidFrom: null, ValidTo: null
		}, false, false, false);

		oView.setBindingContext(oContext);
	}

	async onSave() {

    if (!this.validateForm("accountingItemsForm")) {
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
