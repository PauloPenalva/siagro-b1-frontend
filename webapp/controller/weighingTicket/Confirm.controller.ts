import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import GenericController from "./GenericController";
import JSONModel from "sap/ui/model/json/JSONModel";
import { ui } from "sap/ushell/library";
import Select from "sap/m/Select";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";


/**
 * @namespace siagrob1.controller.weighingTicket
 */
export default class Edit extends GenericController {

	onInit(): void | undefined {	
		this.getRouter().getRoute("weighingTicketsConfirm").attachPatternMatched((ev) => this.routeMatched(ev));
	}

	private routeMatched(ev: Route$MatchedEvent) {
		this.clearStates("formCreateWeighingTicket");
    
    const oModel = this.getView().getModel() as ODataModel;
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/showField", true);

		const oView = this.getView();

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string | null};
		if (id != null) {
      
      const sPath = `/WeighingTickets(${id})`;
      this.getView().bindElement({
        path: sPath,
        events: {
          dataRequested: () => this.setBusy(true), 
          dataReceived: () => { 
            const context = this.getView().getBindingContext();
			
            const select = this.byId("selectStorageAddress") as Select;
            const selectBinding = select.getBinding("items") as ODataListBinding;
            const filter = new Filter({
              filters: [
                new Filter("CardCode", FilterOperator.EQ, context.getProperty("CardCode")),
                new Filter("ItemCode", FilterOperator.EQ, context.getProperty("ItemCode")),
              ]
            });

            selectBinding.filter([filter]); 
            selectBinding.refresh();     
            
            this.setBusy(false) 
          },
        }
      })
      

			return;
		}

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
				oModel.resetChanges(oModel.getUpdateGroupId())
				MessageToast.show("Dados atualizados com sucesso.", {
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
