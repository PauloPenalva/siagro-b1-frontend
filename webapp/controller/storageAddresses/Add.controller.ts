import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
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

    // Natureza é escolhida na inclusão e imutável depois (GAC-1181 fase 2): o campo fica
    // habilitado só aqui, nunca em ui>/editable — mesmo padrão de ui>/typeEditable no Tipo do
    // Contrato. Sem armazém escolhido ainda, Transbordo não pode ser oferecido.
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/natureEditable", true);
    uiModel.setProperty("/storageAddressNatureOptions", this.buildNatureOptions(false));

    const oContext = oBinding.create({
      "DocNumberKey": docNumberInfo.Key,
      "BranchCode": branchInfo.code,
      "UoM": systemSetup.DefaultUoM,
      // Nasce como Terceiros, igual ao default da entidade: lote não classificado
      // não pode habilitar o vínculo de contrato na transferência de titularidade.
      // String vazia aqui quebraria a desserialização do enum se o usuário não
      // tocasse no campo.
      "OwnershipType": "ThirdParty",
      // Nasce Comum, igual ao default da entidade (GAC-1181 fase 2): Transbordo é uma escolha
      // deliberada do operador, só depois de escolher um armazém PRÓPRIO.
      "Nature": "Regular",
    }, false, false, false);

    oView.setBindingContext(oContext);
    this.setBusy(false);
	}

  /**
   * Sobrepõe o value help genérico do armazém (`CommonController#openWarehouseValueHelp`), que
   * é `void` — o `press`/`valueHelpRequest` da XML espera esse contrato, então o trabalho
   * assíncrono fica isolado em `openWarehouseValueHelpAsync` e entra aqui com `void`, mesmo
   * padrão de `onInit`/`attachPatternMatched` logo acima.
   */
  openWarehouseValueHelp(ev: Input$ValueHelpRequestEvent): void {
    void this.openWarehouseValueHelpAsync(ev);
  }

  /**
   * Além de gravar código/nome do armazém como sempre, recalcula a oferta do Select de
   * Natureza (GAC-1181 fase 2) — "Transbordo" só é oferecido para armazém PRÓPRIO. Se o
   * usuário já tinha escolhido Transbordo e troca para um armazém que não é próprio, a escolha
   * recua para Comum: a opção que não existe mais na lista não pode continuar selecionada.
   */
  private async openWarehouseValueHelpAsync(ev: Input$ValueHelpRequestEvent): Promise<void> {
    await this.applyValueHelp(
      ev, "WarehousesSelectDialog", ["Code", "Name", "TaxId", "FName"], "Code");

    const context = this.getView().getBindingContext() as Context;
    if (!context) return;

    // requestProperty, não getProperty: o valor acabou de ser gravado por applyValueHelp, mas
    // o mesmo cuidado do resto do módulo contra undefined silencioso vale aqui.
    const warehouseCode = await (context.requestProperty("WarehouseCode") as Promise<string>);
    const isOwn = await this.isOwnWarehouseAsync(warehouseCode);
    const options = this.buildNatureOptions(isOwn);

    (this.getModel("ui") as JSONModel).setProperty("/storageAddressNatureOptions", options);

    const currentNature = context.getProperty("Nature") as string;
    if (!options.some(option => option.Key === currentNature)) {
      await context.setProperty("Nature", "Regular");
    }
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
