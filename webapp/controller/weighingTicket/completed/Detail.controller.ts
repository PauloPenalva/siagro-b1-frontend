import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { BaseController } from "./BaseController";


/**
 * @namespace siagrob1.controller.weighingTicket.completed
 */
export default class Detail extends BaseController {
	
  onInit(): void | undefined {	
		this.getRouter().getRoute("weighingTicketsCompletedDetail").attachPatternMatched((ev) => this.routeMatched(ev));
	}

	private routeMatched(ev: Route$MatchedEvent) {
		this.clearStates("formCreateWeighingTicket");
    
    const oModel = this.getView().getModel() as ODataModel;
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/visible", true);
    uiModel.setProperty("/required", true);
    uiModel.setProperty("/editable", false);
    uiModel.setProperty("/editableProcessingCost", false)
    uiModel.setProperty("/editableStorageAddress", false)
    uiModel.setProperty("/editableComments", false)
    uiModel.setProperty("/editableGrid", false);
    uiModel.setProperty("/editableFirstWeighing", false);
    uiModel.setProperty("/editableSecondWeighing", false);

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string | null};
		if (id != null) {
      const sPath = `/WeighingTickets(${id})`;
      this.bindElement(sPath);
			return;
		}

	}

  onEdit(): void {
		const oContext = this.getView().getBindingContext();
    
		const sId = oContext.getProperty("Key") as string;
		this.navTo("weighingTicketsCompletedEdit", {id: sId});
	}

  async onReopen() {
     if(!await DialogHelper.confirmDialog("Confirma Reabrir Ticket de Pesagem ?"))
      return;

    const context = this.getView().getBindingContext();
    if (context) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/WeighingTicketsReOpen(...)");
      action.setParameter("Key", context.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Ticket reaberto com sucesso.");
          this.navToEdit();
        })
        .finally(() => this.setBusy(false));
    }
  }

  private navToEdit(): void {
    const oContext = this.getView().getBindingContext();

    if (oContext){
      const sId = oContext.getProperty("Key") as string;
  
      this.navTo("weighingTicketsCompletedEdit", { id: sId });
    }
  }

  async onConfirm() {
    if(!await DialogHelper.confirmDialog("Confirma criar romaneio ?"))
      return;

    const context = this.getView().getBindingContext();
    if (context) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/WeighingTicketsCompleted(...)");
      action.setParameter("Key", context.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Romaneio criado com sucesso.");
          this.navToTicketsList();
        })
        .finally(() => this.setBusy(false));
    }
  }
}
