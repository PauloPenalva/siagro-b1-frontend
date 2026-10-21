import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import SessionService from "siagrob1/services/SessionService";
import BaseController from "../BaseController";

/**
 * @namespace siagrob1.controller.accountingDimensions
 */
export default class Main extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("accountingDimensions").attachPatternMatched(() => this.routeMatched());
	}

	private routeMatched() {
		this.onCancel();
	}

	/** Descarta edições pendentes e relê as cinco linhas. */
	onCancel(): void {
		const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		(this.byId("dimensionsTable").getBinding("items") as ODataListBinding)?.refresh();
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
				// Os rótulos e a visibilidade dos campos de dimensão em todo o app vêm do model `dims`.
				await SessionService.loadDimensions();
				MessageToast.show("Dados salvos com sucesso.", { closeOnBrowserNavigation: false });
			}
		} finally {
			this.setBusy(false);
		}
	}
}
