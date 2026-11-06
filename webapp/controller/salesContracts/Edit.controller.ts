import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import SalesContractsBaseController from "./SalesContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import ContractMarketSection from "siagrob1/helpers/ContractMarketSection";

/**
 * @namespace siagrob1.controller.salesContracts
 */
export default class Edit extends SalesContractsBaseController {
  /** Seção "Mercado" (só com o módulo ligado); inserida antes de ligar o contrato. */
  private marketSection: ContractMarketSection;

	onInit(): void  {	
    this.marketSection = new ContractMarketSection(this.getView());
		this.getRouter().getRoute("salesContractsEdit").attachPatternMatched((ev) => {
      // Os argumentos são lidos já: o evento do roteador é reaproveitado depois do disparo.
      const args = ev.getParameter("arguments") as { id: string };
      void this.marketSection.ensure().then(() => this.editRouteMatched(args));
    });
	}

	private editRouteMatched(args: { id: string }) {
    this.resetDocNumberMode();
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    // O tipo do contrato é definido na criação e não muda mais.
    uiModel.setProperty("/typeEditable", false);
    // Ver Add.controller: o fragmento de locais é compartilhado com o Detail.
    uiModel.setProperty("/postApprovalEditable", true);
    uiModel.setProperty("/postApprovalSaveVisible", false);
        
		this.clearStates("formSalesContracts");
    
    const oModel = this.getView().getModel() as ODataModel;
		
		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = args;
		if (id != null) {
			const sPath = `/SalesContracts(${id})`;
			this.bindElement(sPath);
      this.getInvoices(id);
			return;
		}

	}

	async onSave() {
		if (!this.validateForm("formSalesContracts")) {
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
      this.navTo("salesContractsDetail", {id: oContext.getProperty("Key") as string});
    }
  }
}
