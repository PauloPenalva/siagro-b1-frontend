import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import GenericController from "./GenericController";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace siagrob1.controller.weighinTicket
 */
export default class Add extends GenericController {

	onInit(): void | undefined {
		this.getRouter().getRoute("weighingTicketsNew").attachPatternMatched(async () => this.newRouteMatched());
	}
	private async newRouteMatched() {
		
    this.clearStates("formCreateWeighingTicket");
    
    const systemSetup = this.getSystemSetup();
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
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
    }, false, false, false);

    oView.setBindingContext(oContext);
    
    this.setBusy(false);
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
