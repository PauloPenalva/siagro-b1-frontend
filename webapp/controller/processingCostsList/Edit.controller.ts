import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import TabelaCustoBaseController from "./TabelaCustoBaseController";
import MessageBox from "sap/m/MessageBox";

/**
 * @namespace siagrob1.controller.TabelaCusto
 */
export default class Edit extends TabelaCustoBaseController {

	onInit(): void | undefined {	
		this.getRouter().getRoute("processingCostsListEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
		this.clearStates("processingCostsListForm");
    
    const oModel = this.getView().getModel() as ODataModel;
		const oView = this.getView();

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string | null};
		if (id != null) {
			const sPath = `/ProcessingCosts('${id}')`;
			oView.bindElement({
				path: sPath,
				events: {
					dataRequested: () => this.setBusy(true),
					dataReceived: () => this.setBusy(false),
				}
			})
			return;
		}

	}

	async onSave() {
		if (!this.validateForm("processingCostsListForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    if (!this.validateLineItems()) {
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
