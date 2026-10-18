import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import GenericController from "./GenericController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import type { Input$ValueHelpRequestEvent } from "sap/m/Input";
import RoyaltyFieldsHelper from "siagrob1/controller/royalties/RoyaltyFieldsHelper";

/**
 * @namespace siagrob1.controller.weighinTicket
 */
export default class Add extends GenericController {

	onInit(): void {
		this.getRouter().getRoute("weighingTicketsNew").attachPatternMatched(() => void this.newRouteMatched());
	}
	private async newRouteMatched() {
		
    this.clearStates("formCreateWeighingTicket");
    
    const systemSetup = this.getSystemSetup();
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    this.startDocNumberCreate();
    uiModel.setProperty("/visible", false);
    uiModel.setProperty("/required", false);
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/editableGrid", true);
    uiModel.setProperty("/UoM", systemSetup.DefaultUoM);

    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/WeighingTickets")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

    this.setBusy(true);
    
    const branchInfo = await this.getBranchInfo();
    const results = await this.getDocNumberInfoByTransaction("WeighingTicket")
    const docNumberInfo = results.filter(x => x.Default)[0];

    const oContext = oBinding.create({
      "Type": "",
      "DocNumberKey": docNumberInfo.Key,
      "BranchCode": branchInfo.code,
      // O frete só é informado na tela Confirmar; o tipo já nasce com o padrão da empresa.
      "FreightCalculationMethod": systemSetup.DefaultFreightCalculationMethod ?? "Fixed",
    }, false, false, false);

    oView.setBindingContext(oContext);
    // O model "ui" é global: esconde os campos de royalty até o produto ser escolhido.
    await RoyaltyFieldsHelper.apply(this, undefined, true);
    
    this.setBusy(false);
	}

	/** O produto é escolhido na tela: os campos de royalty dependem dele. */
	override openItemValueHelp(ev: Input$ValueHelpRequestEvent) {
		void this.applyItemValueHelp(ev);
	}

	private async applyItemValueHelp(ev: Input$ValueHelpRequestEvent) {
		await this.applyValueHelp(ev, "ItemsSelectDialog", ["ItemCode", "ItemName"], "ItemCode");
		const ctx = this.getView().getBindingContext() as Context;
		await RoyaltyFieldsHelper.apply(this, ctx?.getProperty("ItemCode") as string, true);
	}

	async onSave() {
		
    if (!this.validateForm("formCreateWeighingTicket")) {
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
      this.navToList();
		}
	}

	onBackToList() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.navToList();
	}

  navToList() {
    this.navTo("weighingTickets");
  }
}
