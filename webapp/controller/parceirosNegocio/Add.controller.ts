import Context from "sap/ui/model/odata/v4/Context";
import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import SessionService from "siagrob1/services/SessionService";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.parceirosNegocio
 */
export default class Add extends BaseController {

	onInit(): void {
		this.getRouter().getRoute("parceirosNegocioAdd").attachPatternMatched(() => this.newRouteMatched());
	}
	private newRouteMatched() {
		this.startDocNumberCreate();
		void this.refreshStandaloneFlag();
		(this.getModel("ui") as JSONModel).setProperty("/paymentConditionName", "");
		// O grid de endereços liga em ui>/editable; sem isto herdava o false de um Detail aberto antes.
		(this.getModel("ui") as JSONModel).setProperty("/editable", true);
		
    this.clearStates("businessPartnerForm");
    
    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/BusinessPartners")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

    // QryGroup23 = 'Y' marca o parceiro como armazém (campo "Armazém" do formulário).
		// Em STANDALONE a série depende do Tipo (Cliente/Fornecedor) e só é escolhida ao selecioná-lo
		// (onCardTypeChange). Sempre enviar DocNumberKey e o código vazio; em SAPB1 o código segue digitado.
		const oContext = oBinding.create({
      ...(SessionService.isSapMode() ? {} : { "DocNumberKey": null, "CardCode": "" }),
      "QryGroup23": "N",
      "DefaultCostCenterCode": null,
      "DefaultAccountingItemCode": null,
      "Addresses": [],
      // Toda propriedade que o formulário edita precisa existir no payload, nem que seja
      // null: sem isso o Select de enum (targetType 'any') e o value help abrem "Must not
      // change a property before it has been read".
      "StateRegistrationIndicator": null,
      "StateRegistration": null,
      "NfeEmails": [],
      "Phone": null,
      "PaymentConditionCode": null,
      "IsRuralProducer": false,
      "RuralProducerType": null,
      "RuralProducerCpf": null,
      "RuralPayrollOption": false,
    }, false, false, false);

		this.resetNfeEmails([]);
		oView.setBindingContext(oContext);
	}

	async onSave() {
		
    if (!this.validateForm("businessPartnerForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    if (this.isManualNumberMissing("CardCode")) {
      return;
    }
    if (!this.validateNfeEmails()) {
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				const oContext = this.getView().getBindingContext() as Context;
				await oContext.created();
				if (!await this.saveNfeEmails(oContext.getProperty("CardCode") as string)) {
					return;
				}
				MessageToast.show("Dados salvos com sucesso.", {
					closeOnBrowserNavigation: false
				});
				// Registro gravado: sai do modo de criação (série e número travados).
				this.resetDocNumberMode();
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
