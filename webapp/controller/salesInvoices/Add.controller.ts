import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { BaseController } from "./BaseController";

/**
 * Inclusão de documento de saída AVULSO — sem romaneio.
 *
 * O que a tela exige do usuário depende da natureza de operação escolhida: peso e
 * quantidade somem ou ficam opcionais conforme as flags da natureza. A validação de
 * verdade é do serviço; aqui a reação é só conforto.
 *
 * @namespace siagrob1.controller.salesInvoices
 */
export default class Add extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("salesInvoicesAdd").attachPatternMatched(() => this.newRouteMatched());
  }

  private newRouteMatched() {
    void this.prepareNewInvoice();
  }

  private async prepareNewInvoice() {
    this.clearStates("formSalesInvoice");

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setData({});
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/editableGrid", true);

    // Só a inclusão escolhe contrato por linha: nas demais telas a coluna é o texto
    // navegado (SalesContract/Code), que não é gravável.
    uiModel.setProperty("/canPickContract", true);
    uiModel.setProperty("/documentTotal", "0,00");

    const oView = this.getView();
    const oModel = this.getModel() as ODataModel;
    const oBinding = oModel.bindList("/SalesInvoices");

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    try {
      this.setBusy(true);

      const branchInfo = await this.getBranchInfo();
      const results = await this.getDocNumberInfoByTransaction("SalesInvoice");
      const docNumberInfo = results.filter(x => x.Default)[0];

      // Toda propriedade que o formulário edita precisa existir no payload inicial, nem
      // que seja como null: sem isso a primeira alteração abre "Must not change a property
      // before it has been read".
      const oContext = oBinding.create({
        DocNumberKey: docNumberInfo?.Key ?? null,
        BranchCode: branchInfo?.code ?? null,
        InvoiceType: "Normal",
        InvoiceStatus: "Pending",
        InvoiceDate: new Date().toISOString(),
        CardCode: null,
        CardName: null,
        DeliveryCardCode: null,
        DeliveryCardName: null,
        TruckingCompanyCode: null,
        TruckingCompanyName: null,
        TruckCode: null,
        FreightTerms: "None",
        FreightCostStandard: 0,
        GrossWeight: 0,
        NetWeight: 0,
        TaxDocumentNumber: null,
        TaxDocumentSeries: null,
        ChaveNFe: null,
        TaxPayerComments: null,
        TaxComments: null,
        Comments: null,
      }, false, false, false);

      oView.setBindingContext(oContext);

      this.attachDocumentTotalRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Value help do contrato de venda da linha.
   *
   * Não usa o `applyValueHelp` genérico porque são dois valores: o Input mostra o `Code`
   * (legível) e quem vale para o servidor é o `SalesContractKey` (GUID). O helper genérico
   * grava com group id `null` — certo para descrição desnormalizada, errado para a CHAVE,
   * que precisa entrar no batch. Mesmo desenho do contrato de compra na Transferência de
   * Titularidade.
   */
  async openSalesContractValueHelp(ev: Input$ValueHelpRequestEvent) {
    const oInput = ev.getSource();
    const oTarget = oInput.getBindingContext() as Context;
    const oInvoice = this.getView().getBindingContext() as Context;

    const cardCode = oInvoice?.getProperty("CardCode") as string;
    const itemCode = oTarget?.getProperty("ItemCode") as string;

    if (!cardCode) {
      MessageBox.warning("Informe o cliente antes de escolher o contrato.");
      return;
    }

    if (!itemCode) {
      MessageBox.warning("Informe o produto da linha antes de escolher o contrato.");
      return;
    }

    // Cliente e produto mudam a cada linha, então são aplicados na abertura — não cabem no
    // XML. Aprovado e com saldo são fixos e ficam no $filter do fragmento.
    const oSelected = await DialogHelper.openTableSelectDialog(
      this, "SalesContractsSelectDialog", ["Code", "CardCode", "CardName"],
      [
        new Filter("CardCode", FilterOperator.EQ, cardCode),
        new Filter("ItemCode", FilterOperator.EQ, itemCode),
      ]);

    // Cancelar resolve undefined: não mexer no que já estava preenchido.
    if (!oSelected) {
      return;
    }

    oInput.setValue(oSelected.getProperty("Code") as string);
    await oTarget.setProperty("SalesContractKey", oSelected.getProperty("Key"));
  }

  onAddItem() {
    const oTable = this.byId("tableSalesInvoicesItems") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;

    oBinding.create({
      ItemCode: null,
      ItemName: null,
      UsageCode: null,
      UsageName: null,
      Quantity: 0,
      UnitPrice: 0,
      UnitOfMeasureCode: null,
      SalesContractKey: null,
      Ncm: null,
      CstIcms: null,
      IcmsBase: 0,
      IcmsRate: 0,
      IcmsValue: 0,
      CstPis: null,
      PisBase: 0,
      PisRate: 0,
      PisValue: 0,
      CstCofins: null,
      CofinsBase: 0,
      CofinsRate: 0,
      CofinsValue: 0,
      CostCenterCode: null,
      LedgerAccountCode: null,
      Cfop: null,
    }, false, true, false);

    this.refreshDocumentTotal();
  }

  onRemoveItem() {
    const oTable = this.byId("tableSalesInvoicesItems") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const oContext = oTable.getContextByIndex(i) as Context;
    void oContext.delete("$auto").then(() => this.refreshDocumentTotal());
  }

  async onSave() {
    if (!this.validateForm("formSalesInvoice")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    const oTable = this.byId("tableSalesInvoicesItems") as Table;

    if ((oTable.getBinding("rows") as ODataListBinding).getLength() === 0) {
      MessageBox.warning("Inclua ao menos um item no documento.");
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

    this.navTo("salesInvoices");
  }

  private navToDetail() {
    const oContext = this.getView().getBindingContext() as Context;

    if (oContext) {
      this.navTo("salesInvoicesDetail", { id: oContext.getProperty("Key") as string });
    }
  }
}
