 
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import BaseController from "./SalesContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace siagrob1.controller.salesContracts
 */
export default class Add extends BaseController {

	onInit(): void  {
		this.getRouter().getRoute("salesContractsNew").attachPatternMatched(() => void this.newRouteMatched());
	}

	private async newRouteMatched() {
		
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    // O fragmento de locais de entrega é compartilhado com o Detail, onde a edição
    // sobrevive à aprovação. Aqui tudo é editável, então o flag acompanha.
    uiModel.setProperty("/postApprovalEditable", true);
    uiModel.setProperty("/postApprovalSaveVisible", false);
    
		this.resetChanges();

    this.clearStates("formSalesContracts");
    
    const oView = this.getView();
		const oModel = this.getView().getModel() as ODataModel;
		const oBinding = oModel.bindList("/SalesContracts")

	  this.setBusy(true);
    const systemSetup = this.getSystemSetup();
    const branchInfo = await this.getBranchInfo();
    const results = await this.getDocNumberInfoByTransaction("SalesContract")
    const docNumberInfo = results.filter(x => x.Default)[0];

    const oContext = oBinding.create({
      "Type": "Fixed",
      "Status": "Draft",
      "FreightTerms": "None",
      "StandardCurrency": systemSetup.DefaultCurrency,
      "MarketType": "",
      "DocNumberKey": docNumberInfo.Key,
      "BranchCode": branchInfo.code,
      "UnitOfMeasureCode": systemSetup.DefaultUoM,
      "FreightUmCode": systemSetup.DefaultFreightUoM,
      "Price": 0
    }, false, false, false);

    oView.setBindingContext(oContext);
    this.setBusy(false)
	}

	async onSave() {
		
    if (!this.validateForm("formSalesContracts")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				this.navToDetail();
			}
		} finally {
			this.setBusy(false);
		}
	}

  private resetChanges(){
    const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}
  }

	onCancel() {
    this.resetChanges();
    this.onNavBack();
	}

  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("salesContractsDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
