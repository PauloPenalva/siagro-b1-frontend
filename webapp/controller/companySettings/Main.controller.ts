import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Control from "sap/ui/core/Control";
import BaseController from "../BaseController";

/**
 * @namespace siagrob1.controller.companySettings
 */
export default class Main extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("companySettings").attachPatternMatched(() => this.routeMatched());
	}

	private routeMatched() {
		this.onCancel();
	}

	/** Descarta edições pendentes e relê o registro único. */
	onCancel(): void {
		const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		(this.byId("companySettingsForm") as Control).getObjectBinding()?.refresh();
	}

	async onSave() {
		const oModel = this.getView().getModel() as ODataModel;

		if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			MessageBox.information("Não há alterações para salvar.");
			return;
		}

		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());

			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				MessageToast.show("Dados salvos com sucesso.", { closeOnBrowserNavigation: false });
			}
		} finally {
			this.setBusy(false);
		}
	}
}
