/* eslint-disable @typescript-eslint/no-explicit-any */
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.storageContracts
 */
export default class Add extends BaseController {

	onInit(): void  {
		this.getRouter().getRoute("storageTransactionsNew").attachPatternMatched(async () => this.newRouteMatched());
	}

	private async newRouteMatched() {
		const systemSetup = this.getSystemSetup();
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/currency", this.formatter.formatCurrencySymbol(systemSetup.DefaultCurrency));
    
		this.resetChanges();

    this.clearStates("storageTransactionForm");
    
    const oView = this.getView();
		const oModel = this.getView().getModel() as ODataModel;
		const oBinding = oModel.bindList("/StorageTransactions")
    
    this.setBusy(true);
    
    const branchInfo = await this.getBranchInfo();
    const results = await this.getDocNumberInfoByTransaction("StorageTransaction")
    const docNumberInfo = results.filter(x => x.Default)[0];

    const oContext = oBinding.create({
      "TransactionType": "",
      "NetWeight": 0,
      "InvoiceQty": 0,
      "DocNumberKey": docNumberInfo.Key,
      "BranchCode": branchInfo.code,
      "UnitOfMeasureCode": systemSetup.DefaultUoM,
    }, false, false, false);

    oView.setBindingContext(oContext);
      
    this.setBusy(false)
	}

	async onSave() {
		
    if (!this.validateForm("storageTransactionForm")) {
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
      this.navTo("storageTransactionsDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
