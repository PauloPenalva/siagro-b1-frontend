import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.parceirosNegocio
 */
export default class Add extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("parceirosNegocioAdd").attachPatternMatched(() => this.newRouteMatched());
	}
	private newRouteMatched() {
		void this.refreshStandaloneFlag();
		(this.getModel("ui") as JSONModel).setProperty("/paymentConditionName", "");
		
    this.clearStates("businessPartnerForm");
    
    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/BusinessPartners")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

    //QryGroup23 = Y --> Cadastro de Armazem
		const oContext = oBinding.create({
      "QryGroup23": "N",
      "Addresses": [],
      // Toda propriedade que o formulário edita precisa existir no payload, nem que seja
      // null: sem isso o Select de enum (targetType 'any') e o value help abrem "Must not
      // change a property before it has been read".
      "StateRegistrationIndicator": null,
      "StateRegistration": null,
      "NfeEmail": null,
      "Phone": null,
      "PaymentConditionCode": null,
    }, false, false, false);

		oView.setBindingContext(oContext);
	}

	async onSave() {
		
    if (!this.validateForm("businessPartnerForm")) {
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
