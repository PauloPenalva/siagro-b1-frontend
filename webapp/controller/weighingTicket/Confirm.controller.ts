import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import GenericController from "./GenericController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";


/**
 * @namespace siagrob1.controller.weighingTicket
 */
export default class Confirm extends GenericController {

	onInit(): void | undefined {	
		this.getRouter().getRoute("weighingTicketsConfirm").attachPatternMatched((ev) => this.routeMatched(ev));
	}

	private routeMatched(ev: Route$MatchedEvent) {
		this.clearStates("formCreateWeighingTicket");
    
    const systemSetup = this.getSystemSetup();
    const oModel = this.getView().getModel() as ODataModel;
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/visible", true);
    uiModel.setProperty("/required", true);
    uiModel.setProperty("/editable", false);
    uiModel.setProperty("/editableProcessingCost", true)
    uiModel.setProperty("/editableStorageAddress", true)
    uiModel.setProperty("/editableComments", true)
    uiModel.setProperty("/editableGrid", true);
    uiModel.setProperty("/editableFirstWeighing", false);
    uiModel.setProperty("/editableSecondWeighing", false);
    uiModel.setProperty("/UoM", systemSetup.DefaultUoM);

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
				this.navToDetail();
			}
		} finally {
			this.setBusy(false);
		}
		
	}

  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("weighingTicketsDetail", {id: oContext.getProperty("Key") as string});
    }
  }

}
