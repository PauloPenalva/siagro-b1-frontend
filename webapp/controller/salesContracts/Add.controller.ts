/* eslint-disable @typescript-eslint/no-explicit-any */
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
		this.getRouter().getRoute("salesContractsNew").attachPatternMatched(() => this.newRouteMatched());
	}

	private newRouteMatched() {
		
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    
		this.resetChanges();

    this.clearStates("formSalesContracts");
    
    const oView = this.getView();
		const oModel = this.getView().getModel() as ODataModel;
		const oBinding = oModel.bindList("/SalesContracts")

	  this.setBusy(true);
    this.getDocNumberInfoByTransaction("SalesContract")
      .then(results => {

        const docNumberInfo = results.filter(x => x.Default)[0];

        const oContext = oBinding.create({
          "Type": "Fixed",
          "Status": "Draft",
          "FreightTerms": "None",
          "StandardCurrency": "Brl",
          "MarketType": "",
          "DocNumberKey": docNumberInfo.Key,
        }, false, false, false);

        oView.setBindingContext(oContext);
      })
      .finally(() => this.setBusy(false))
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
