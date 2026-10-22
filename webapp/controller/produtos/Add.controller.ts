import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import SessionService from "siagrob1/services/SessionService";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.produtos
 */
export default class Add extends BaseController {

	private _itemContext: Context;

	onInit(): void {
		this.getRouter().getRoute("produtosAdd").attachPatternMatched(() => void this.newRouteMatched());
	}
	private async newRouteMatched() {
    this.startDocNumberCreate();

    this.clearStates("itemForm");
    void this.refreshStandaloneFlag();

    // Série só em STANDALONE; em SAPB1 o código segue digitado, sem série.
    const standalone = !SessionService.isSapMode();
    const docNumberInfo = standalone
      ? (await this.getDocNumberInfoByTransaction("Item")).find(x => x.Default)
      : undefined;

    const oView = this.getView();
		const oModel = this.getModel() as ODataModel;
		const oBinding = oModel.bindList("/Items")

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

    // Em STANDALONE sempre enviar a série (sem DocNumberKey o servidor trata o código como legado) e o
    // código vazio: a série Automática gera, a Manual recebe o digitado.
    const oContext = oBinding.create({
      ...(standalone ? { "DocNumberKey": docNumberInfo?.Key ?? null, "ItemCode": "" } : {}),
      "ItmsGrpCod": 105,
      "Enabled": "SIM",
      "GoodsOrigin": null,
      "Ncm": null,
      "Cest": null,
      "LedgerAccountCode": null,
      "CostCenterCode": null,
      "AccountingItemCode": null,
    }, false, false, false);

		this._itemContext = oContext;
		oView.setBindingContext(oContext);
	}

	async onSave() {

    if (!this.validateForm("itemForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    if (this.isManualNumberMissing("ItemCode")) {
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
				// Registro gravado: sai do modo de criação (série e número travados).
				this.resetDocNumberMode();
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
