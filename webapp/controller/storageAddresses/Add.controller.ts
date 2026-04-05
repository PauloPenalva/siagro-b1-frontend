import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import LoteArmazenagemBaseController from "./LoteArmazenagemBaseController";

/**
 * @namespace siagrob1.controller.storageAddresses
 */
export default class Add extends LoteArmazenagemBaseController {

	onInit(): void  {
		this.getRouter().getRoute("storageAddressesNew").attachPatternMatched(() => this.newRouteMatched());
	}
	private newRouteMatched() {
		
    this.clearStates("formLoteArmazenagem");
    
    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/StorageAddresses")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

	  this.setBusy(true);
    this.getDocNumberInfoByTransaction("StorageAddress")
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
		
    if (!this.validateForm("formLoteArmazenagem")) {
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
