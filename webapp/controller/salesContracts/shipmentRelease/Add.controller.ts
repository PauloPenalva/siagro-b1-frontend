import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import BaseController from "../SalesContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import MessageToast from "sap/m/MessageToast";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";

/**
 * Id do bloco de cabeçalho ligado ao contrato de origem. O contexto da view é a
 * liberação transiente, então os dados do contrato vivem numa ligação própria.
 */
const CONTRACT_HEADER_ID = "salesShipmentReleaseContractHeader";

/**
 * @namespace siagrob1.controller.salesContracts.shipmentRelease
 */
export default class Add extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("salesContractsShipmentReleaseRequest").attachPatternMatched((ev) => this.newRouteMatched(ev));
  }

  /**
   * Locais de entrega do contrato de origem - não o cadastro inteiro de clientes.
   * A lista é relativa ao contrato, por isso o `elementPath`; a mesma regra é
   * validada no servidor (SalesShipmentReleasesCreateService).
   */
  openSalesContractDeliveryLocationsValueHelp(ev: Input$ValueHelpRequestEvent) {
    const oContext = this.getView().getBindingContext() as Context;
    const sContractKey = oContext?.getProperty("SalesContractKey") as string;

    if (!sContractKey) {
      MessageBox.error("Contrato de origem não identificado. Recarregue a tela.");
      return;
    }

    void this.applyValueHelp(
      ev,
      "SalesContractDeliveryLocationsSelectDialog",
      ["CardCode", "CardName"],
      "CardCode",
      [],
      `/SalesContracts(${sContractKey})`
    );
  }

  private newRouteMatched(ev: Route$MatchedEvent) {
    const { salesContractId } = ev.getParameter("arguments") as { salesContractId: string };
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);

    this.resetChanges();

    this.clearStates("formSalesContractRequestShipmentRelease");

    const oView = this.getView();
    const oModel = this.getView().getModel() as ODataModel;
    const oBinding = oModel.bindList("/SalesShipmentReleases");

    // O cabeçalho mostra os dados do contrato de origem (cliente, produto, saldo a
    // liberar). Ligação própria: o contexto da view é a liberação transiente, que não
    // resolve a navegação para o contrato.
    //
    // Ligar ANTES de setBindingContext: enquanto o cabeçalho não tem ligação própria ele
    // herda a da view, e cada campo (Code, CardName, ...) é procurado na liberação
    // transiente - uma enxurrada de "invalid segment" no console a cada abertura.
    this.byId(CONTRACT_HEADER_ID).bindElement(`/SalesContracts(${salesContractId})`);

    const oContext = oBinding.create({
      SalesContractKey: salesContractId
    }, false, false, false);

    oView.setBindingContext(oContext);
  }

  async onSave() {

    if (!this.validateForm("formSalesContractRequestShipmentRelease")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    if (!await this.validateReleasedQuantity()) {
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());
      if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        MessageToast.show("Solicitação criada com sucesso.");
        this.navToList();
      }
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Auxílio visual: recusa quantidade inválida antes de ir ao servidor. A guarda real
   * continua em SalesShipmentReleasesCreateService - aqui só trocamos um 400 genérico
   * por uma mensagem que diz quanto ainda há para liberar.
   */
  private async validateReleasedQuantity(): Promise<boolean> {
    const oContext = this.getView().getBindingContext() as Context;
    const quantity = Number(oContext?.getProperty("ReleasedQuantity") ?? 0);

    if (quantity <= 0) {
      MessageBox.error("Quantidade da liberação deve ser maior que zero.");
      return false;
    }

    const oContractContext = this.byId(CONTRACT_HEADER_ID).getBindingContext() as Context;

    if (!oContractContext) {
      // Sem o contrato carregado não dá para comparar; o servidor ainda decide.
      return true;
    }

    // requestProperty garante o valor mesmo que a propriedade computada ainda não
    // tenha chegado do servidor.
    const available = Number(await oContractContext.requestProperty("PhysicalAvailableToRelease") ?? 0);

    if (quantity > available) {
      MessageBox.error(
        `Quantidade excede o saldo disponível para liberação do contrato ` +
        `(${available.toLocaleString("pt-BR", { minimumFractionDigits: 3 })}).`
      );
      return false;
    }

    return true;
  }

  private resetChanges() {
    const oModel = this.getView().getModel() as ODataModel;

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }
  }

  onCancel() {
    this.resetChanges();
    this.onNavBack();
  }

  private navToList() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("salesContractsShipmentRelease");
    }
  }
}
