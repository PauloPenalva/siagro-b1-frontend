import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import BaseController from "../BaseController";

/**
 * @namespace siagrob1.controller.ledgerAccounts
 */
export default class Add extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("ledgerAccountsNew").attachPatternMatched(() => this.newRouteMatched());
	}

	private newRouteMatched() {

    this.clearStates("ledgerAccountsForm");

    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/LedgerAccounts")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		// Type precisa vir no payload inicial mesmo nulo: sem isso a propriedade não existe
		// no cache da entidade transiente e o Select estoura com "Must not change a property
		// before it has been read" quando o usuário escolhe o tipo.
		// AllowsPosting nasce marcado porque conta analítica é o caso comum.
		const oContext = oBinding.create(
			{ Type: null, AllowsPosting: true, Inactive: false },
			false,
			false,
			false
		);

		oView.setBindingContext(oContext);
	}

	async onSave() {

    if (!this.validateForm("ledgerAccountsForm")) {
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
