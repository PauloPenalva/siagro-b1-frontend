import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import LoteArmazenagemBaseController from "./LoteArmazenagemBaseController";

/**
 * @namespace siagrob1.controller.storageAddresses
 */
export default class Edit extends LoteArmazenagemBaseController {

	onInit(): void {	
		this.getRouter().getRoute("storageAddressesEdit").attachPatternMatched((ev) => this.editRouteMatched(ev));
	}

	private editRouteMatched(ev: Route$MatchedEvent) {
		this.clearStates("formLoteArmazenagem");

    const oModel = this.getView().getModel() as ODataModel;
		const oView = this.getView();

    // Natureza é imutável depois de criada (GAC-1181 fase 2): a Edição sempre mostra o campo
    // desabilitado, nunca ui>/editable — mesmo padrão de ui>/typeEditable no Tipo do Contrato.
    (this.getModel("ui") as JSONModel).setProperty("/natureEditable", false);

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId())
		}

		const {id} = ev.getParameter("arguments") as {id: string};
		if (id != null) {
			const sPath = `/StorageAddresses('${id}')`;
			oView.bindElement({
				path: sPath,
				events: {
					dataRequested: () => this.setBusy(true),
					// Só desmarca o busy DEPOIS de loadNatureOptionsAsync: senão a tela aparece um
					// instante com o Select de Natureza sem itens (a chamada a WarehousesGetComplement
					// é rede) e ele pisca vazio antes de se corrigir sozinho — mesmo cuidado do resto
					// do módulo contra Select com itens carregando depois do selectedKey.
					dataReceived: () => {
            void this.loadNatureOptionsAsync()
              .catch(() => MessageBox.error("Erro ao carregar a natureza do lote."))
              .finally(() => this.setBusy(false));
          },
				}
			})
			return;
		}

	}

  /**
   * Calcula a oferta do Select de Natureza uma única vez, ao carregar o lote (GAC-1181 fase
   * 2): o campo fica desabilitado na Edição, então trocar de armazém depois não deve mexer
   * nele — só a inclusão recalcula (`Add#openWarehouseValueHelp`).
   *
   * `requestProperty`, não `getProperty`: mesmo cuidado do resto do módulo contra undefined
   * silencioso, mesmo com WarehouseCode/Nature já ligados a controles da tela.
   */
  private async loadNatureOptionsAsync(): Promise<void> {
    const context = this.getView().getBindingContext() as Context;
    if (!context) return;

    const [warehouseCode, currentNature] = await Promise.all([
      context.requestProperty("WarehouseCode") as Promise<string>,
      context.requestProperty("Nature") as Promise<string>,
    ]);

    const isOwn = await this.isOwnWarehouseAsync(warehouseCode);
    const options = this.buildNatureOptions(isOwn, currentNature);

    (this.getModel("ui") as JSONModel).setProperty("/storageAddressNatureOptions", options);
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
