import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import TabelaCustoBaseController from "./TabelaCustoBaseController";
import MessageBox from "sap/m/MessageBox";

/**
 * @namespace siagrob1.controller.TabelaCusto
 */
export default class Add extends TabelaCustoBaseController {

	onInit(): void | undefined {
		this.getRouter().getRoute("tabelaCustoNew").attachPatternMatched(() => this.newRouteMatched());
	}
	private newRouteMatched() {
		
    this.clearStates("formTabelaCusto");
    
    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/TabelasCusto")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const oContext = oBinding.create({}, false, false, false);

		oView.setBindingContext(oContext);
	}

	async onSave() {
		
    if (!this.validateForm("formTabelaCusto")) {
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
