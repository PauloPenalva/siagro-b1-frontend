import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import Context from "sap/ui/model/odata/v4/Context";

/**
 * @namespace siagrob1.controller.storageInvoices
 */
export default class Add extends BaseController {

	onInit(): void | undefined {
		this.getRouter().getRoute("storageInvoicesAdd").attachPatternMatched(() => this.newRouteMatched());
	}
	private newRouteMatched() {
		
    this.clearStates("storageInvoicesForm");
    
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/visible", false);
    uiModel.setProperty("/required", false);
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/editableGrid", true);

    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/StorageInvoices")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

    this.setBusy(true);
    this.getDocNumberInfoByTransaction("StorageInvoice")
      .then(results => {

        const docNumberInfo = results.filter(x => x.Default)[0];

        const oContext = oBinding.create({
          "DocNumberKey": docNumberInfo.Key,
        }, false, false, false);

        oView.setBindingContext(oContext);
      })
      .finally(() => this.setBusy(false))
	}

	async onSave() {
		
    if (!this.validateForm("storageInvoicesForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;
    const ctx = this.getView().getBindingContext() as Context;

		try {
			this.setBusy(true);
      
      const action = oModel.bindContext("/StorageInvoiceClosing(...)");
      action.setParameter("DocNumberKey", ctx.getProperty("DocNumberKey"));
      action.setParameter("StorageAddressCode", ctx.getProperty("StorageAddressCode"));
      action.setParameter("PeriodStart", ctx.getProperty("PeriodStart"));
      action.setParameter("PeriodEnd", ctx.getProperty("PeriodEnd"));
      action.setParameter("StorageAddressCode", ctx.getProperty("StorageAddressCode"));
      action.setParameter("Notes", ctx.getProperty("Notes"));
      action.setParameter("IncludeUnpricedItems", false);
      action.setParameter("ClosingDate", ctx.getProperty("ClosingDate"));

      action.invoke()
        .then(() => {
          const resultContext = action.getBoundContext();
          const { Key } = resultContext.getObject();
          this.navTo("storageInvoicesDetail", { id: Key} );

          MessageToast.show("Dados salvos com sucesso.", {
            closeOnBrowserNavigation: false
          });
        });
    
      } finally {
      this.setBusy(false);      
		}
	}

	onCancel() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.navToList();
	}

  navToList() {
    this.navTo("storageInvoices");
  }
}
