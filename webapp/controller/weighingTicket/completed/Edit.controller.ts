import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import { BaseController } from "./BaseController";


/**
 * @namespace siagrob1.controller.weighingTicket.completed
 */
export default class Edit extends BaseController {

	onInit(): void | undefined {	
		this.getRouter().getRoute("weighingTicketsCompletedEdit").attachPatternMatched((ev) => this.routeMatched(ev));
	}

	private routeMatched(ev: Route$MatchedEvent) {
		this.clearStates("formCreateWeighingTicket");
    
    const oModel = this.getView().getModel() as ODataModel;
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/visible", true);
    uiModel.setProperty("/required", true);
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/editableProcessingCost", true)
    uiModel.setProperty("/editableStorageAddress", true)
    uiModel.setProperty("/editableComments", true)
    uiModel.setProperty("/editableGrid", true);
    uiModel.setProperty("/editableFirstWeighing", true);
    uiModel.setProperty("/editableSecondWeighing", true);

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
				MessageToast.show("Dados salvos com sucesso.", {
					closeOnBrowserNavigation: false
				});

        this.navToDetail();
			}
		} finally {
			this.setBusy(false);
		}
	}

	onNavToDetail() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.onNavBack();
	}
  
  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("weighingTicketsCompletedDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
