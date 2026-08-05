import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import LoteArmazenagemBaseController from "./LoteArmazenagemBaseController";

/**
 * @namespace siagrob1.controller.storageAddresses
 */
export default class Add extends LoteArmazenagemBaseController {

	onInit(): void  {
		this.getRouter().getRoute("storageAddressesNew").attachPatternMatched(() => void this.newRouteMatched());
	}
	private async newRouteMatched() {
		
    this.clearStates("formLoteArmazenagem");
    
    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/StorageAddresses")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

	  this.setBusy(true);
    const systemSetup = this.getSystemSetup();
    const branchInfo = await this.getBranchInfo();
    const results = await this.getDocNumberInfoByTransaction("StorageAddress")
    const docNumberInfo = results.filter(x => x.Default)[0];

    const oContext = oBinding.create({
      "DocNumberKey": docNumberInfo.Key,
      "BranchCode": branchInfo.code,
      "UoM": systemSetup.DefaultUoM,
      // Nasce como Terceiros, igual ao default da entidade: lote não classificado
      // não pode habilitar o vínculo de contrato na transferência de titularidade.
      // String vazia aqui quebraria a desserialização do enum se o usuário não
      // tocasse no campo.
      "OwnershipType": "ThirdParty",
    }, false, false, false);

    oView.setBindingContext(oContext);
    this.setBusy(false);
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
