import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import BaseController from "../BaseController";

/**
 * @namespace siagrob1.controller.usages
 */
export default class Edit extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("usagesEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
		this.clearStates("usagesForm");

    void this.applyErpMode();

    const oModel = this.getView().getModel() as ODataModel;
		const oView = this.getView();

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string};
		if (id != null) {
			// Chave inteira: sem aspas, ao contrário dos cadastros de código string.
			const sPath = `/Usages(${id})`;
			oView.bindElement({
				path: sPath,
				events: {
					dataRequested: () => this.setBusy(true),
					dataReceived: () => this.setBusy(false),
				}
			})
			return;
		}

	}

	async onSave() {
		if (!this.validateForm("usagesForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;
		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				oModel.resetChanges(oModel.getUpdateGroupId())
				MessageToast.show("Dados atualizados com sucesso.", {
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

	/**
	 * Em SAPB1 a identidade fiscal (nome, descrição, CFOP) vem do OUSG e é somente-leitura;
	 * o efeito no contrato continua editável, porque é do Siagro. Inicializar como `true`
	 * antes da resposta manteria o comportamento do STANDALONE, que é o caso permissivo.
	 */
	private async applyErpMode() {
		const uiModel = this.getModel("ui") as JSONModel;
		const systemInfo = await this.getSystemInfo();

		uiModel.setProperty("/identityEditable", systemInfo?.erp !== "SAPB1");
	}
}
