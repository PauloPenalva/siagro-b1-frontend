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

	onInit(): void | undefined {	
		this.getRouter().getRoute("weighingTicketsFirstWeighing").attachPatternMatched((ev) => this.routeMatched(ev));
	}

	private routeMatched(ev: Route$MatchedEvent) {
		this.clearStates("formCreateFirstWeighingTicket");
    
    const oModel = this.getView().getModel() as ODataModel;
   	const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/editableGrid", true);

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string | null};
		if (id != null) {
      const sPath = `/WeighingTickets(${id})`;
      this.bindElement(sPath);

      const ctx = this.getView().getBindingContext() as Context;
      if (ctx) {
        ctx.setProperty("Stage", "ReadyForSecondWeighing");
      }
			return;
		}

	}

	async onSave() {
		if (!this.validateForm("formCreateFirstWeighingTicket")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) return;

    const value = +ctx.getProperty("FirstWeighValue");
    if (value < 1){
      MessageBox.error("Pesagem não informada. Não é possivel processeguir.")
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

        this.navToList();
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

		this.navToList();
	}
  
  private navToList() {
    this.navTo("weighingTickets");
  }
}
