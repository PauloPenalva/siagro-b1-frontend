import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import GenericController from "./GenericController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";


/**
 * @namespace siagrob1.controller.weighingTicket
 */
export default class FirstWeighing extends GenericController {

	onInit(): void {	
		this.getRouter().getRoute("weighingTicketsSecondWeighing").attachPatternMatched((ev) => this.routeMatched(ev));
	}

	private routeMatched(ev: Route$MatchedEvent) {
		this.clearStates("formCreateSecondWeighingTicket");
    
    const oModel = this.getView().getModel() as ODataModel;
   	const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/editableGrid", true);
    uiModel.setProperty("/editableFirstWeighing", false);
    uiModel.setProperty("/editableSecondWeighing", true);
    
    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string};
		if (id != null) {
      const sPath = `/WeighingTickets(${id})`;
      this.bindElement(sPath);

      const ctx = this.getView().getBindingContext() as Context;
      if (ctx) {
        void ctx.setProperty("Stage", "ReadyForCompleting");
      }

      void this.startWeighingCapture("Closing", "weighingTicketsSecondWeighing");
			return;
		}

	}

	onExit(): void {
		this.stopWeighingCapture();
	}

	protected applyCapturedWeight(weight: number): void {
		const ctx = this.getView().getBindingContext() as Context;
		void ctx?.setProperty("SecondWeighValue", weight);
	}

	async onSave() {
		if (!this.validateForm("formCreateSecondWeighingTicket")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) return;

    const value = +ctx.getProperty("SecondWeighValue");
    if (value < 1){
      MessageBox.error("Pesagem não informada. Não é possivel processeguir.")
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
      
      const action = oModel.bindContext("/WeighingTicketsSecondWeighing(...)");
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("Value", value);
      action.setParameter("Comments", ctx.getProperty("Comments"));
      action.setParameter("CaptureId", (this.getModel("ui") as JSONModel).getProperty("/captureId"));

      await action.invoke();

      MessageToast.show("Dados salvos com sucesso.", {
        closeOnBrowserNavigation: false
      });

      this.navToTicketsList();
		} finally {
			this.setBusy(false);
		}
	}

}
