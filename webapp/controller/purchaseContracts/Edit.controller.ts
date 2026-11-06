import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import PurchaseContractsBaseController from "./PurchaseContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import ContractMarketSection from "siagrob1/helpers/ContractMarketSection";

/**
 * @namespace siagrob1.controller.purchaseContracts
 */
export default class Edit extends PurchaseContractsBaseController {
  /** Seção "Mercado" (só com o módulo ligado); inserida antes de ligar o contrato. */
  private marketSection: ContractMarketSection;

	onInit(): void  {	
    this.marketSection = new ContractMarketSection(this.getView(), this.getRouter(), "purchaseContractsEdit");
		this.getRouter().getRoute("purchaseContractsEdit").attachPatternMatched((ev) => {
      // Os argumentos são lidos já: o evento do roteador é reaproveitado depois do disparo.
      const args = ev.getParameter("arguments") as { id: string };
      this.marketSection.whenReady(() => this.editRouteMatched(args));
    });
	}

	private editRouteMatched(args: { id: string }) {
    this.resetDocNumberMode();
		void this.refreshStandaloneFlag();
    const uiModel = this.getModel("ui") as JSONModel;
    
    uiModel.setProperty("/editable", true);
    // O tipo do contrato é definido na criação e não muda mais.
    uiModel.setProperty("/typeEditable", false);

		this.clearStates("formPurchaseContracts");
    
    const oModel = this.getView().getModel() as ODataModel;
		
		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = args;
		if (id != null) {
			const sPath = `/PurchaseContracts(${id})`;
			this.bindElement(sPath);

      this.getAllocations(id);
			return;
		}

	}

	async onSave() {
		if (!this.validateForm("formPurchaseContracts")) {
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

	onCancel() {
	 	const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		this.onNavBack();
	}

  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("purchaseContractsDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
