import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import RequestModel from "siagrob1/model/RequestModel";

/**
 * @namespace siagrob1.controller.storageTransactions
 */
export default class Edit extends BaseController {

	onInit(): void  {	
		this.getRouter().getRoute("storageTransactionsEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
    const systemSetup = this.getSystemSetup();  
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/currency", this.formatter.formatCurrencySymbol(systemSetup.DefaultCurrency));
        
		this.clearStates("storageTransactionForm");
    
    const oModel = this.getView().getModel() as ODataModel;
		
		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string };
		if (id != null) {

      //beforeEdit
      this.setBusy(true);
      this.beforeEdit(id)
         .done(data => {
            
          this.setBusy(false);
            const { TransactionOrigin } = data;
            if (TransactionOrigin !== 'StorageTransaction'){
              MessageBox.warning("Este romaneio não pode ser editado por essa rotina, pois foi criado por outro processo.");
              this.onNavBack();
            };

            const sPath = `/StorageTransactions(${id})`;
			      this.bindElement(sPath);

          })
          .catch(() =>{ 
            console.log();
            
            this.setBusy(false)
            this.onNavBack();
          });

			return;
		}

	}


  private beforeEdit(id: string): JQuery.jqXHR {
    const requestModel = new RequestModel();

    return requestModel.get(this.api.storageTransactions + `(${id})?$select=TransactionOrigin`);     
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
				oModel.resetChanges(oModel.getUpdateGroupId())
				this.navToDetail();
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

  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("storageTransactionsDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
