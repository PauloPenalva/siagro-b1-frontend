import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import BaseController from "../BaseController";

/**
 * @namespace siagrob1.controller.usages
 */
export default class Add extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("usagesNew").attachPatternMatched(() => this.newRouteMatched());
	}

	private newRouteMatched() {

    this.clearStates("usagesForm");

    // Só se chega aqui em STANDALONE (em SAPB1 o botão Incluir some): a identidade é
    // editável por definição.
    (this.getModel("ui") as JSONModel).setProperty("/identityEditable", true);

    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/Usages")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		// Toda propriedade que o formulário edita precisa existir no payload inicial: se
		// faltar, o UI5 loga "Accessed value is not primitive" e a primeira alteração abre
		// "Must not change a property before it has been read".
		const oContext = oBinding.create({
			ContractBalanceEffect: "None",
			ContractValueEffect: "None",
			RequiresContract: false,
			RequiresQuantity: true,
			RequiresWeight: false,
			IsDefault: false,
			Inactive: false,
			Description: null,
			CfopOutgoingInState: null,
			CfopOutgoingOutState: null,
		}, false, false, false);

		oView.setBindingContext(oContext);
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
