import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import { Select$ChangeEvent } from "sap/m/Select";
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

    // Inicializar ANTES do primeiro render: binding indefinido faz `visible` valer true,
    // e os campos de peso apareceriam antes de qualquer natureza ser escolhida.
    uiModel.setProperty("/requiresWeight", false);
    uiModel.setProperty("/requiresQuantity", false);
    uiModel.setProperty("/requiresContract", false);

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
        UsageCode: null,
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
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * A natureza escolhida governa o que a tela pede. O registro inteiro vem do contexto do
   * item selecionado — a lista do Select já está ligada a /Usages, então não há requisição
   * extra.
   */
  onUsageChange(ev: Select$ChangeEvent) {
    const uiModel = this.getModel("ui") as JSONModel;
    const oUsage = ev.getParameter("selectedItem")?.getBindingContext() as Context;

    uiModel.setProperty("/requiresWeight", !!oUsage?.getProperty("RequiresWeight"));
    uiModel.setProperty("/requiresQuantity", !!oUsage?.getProperty("RequiresQuantity"));
    uiModel.setProperty("/requiresContract", !!oUsage?.getProperty("RequiresContract"));
  }

  onAddItem() {
    const oTable = this.byId("tableSalesInvoicesItems") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;

    oBinding.create({
      ItemCode: null,
      ItemName: null,
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
    }, false, true, false);
  }

  onRemoveItem() {
    const oTable = this.byId("tableSalesInvoicesItems") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const oContext = oTable.getContextByIndex(i) as Context;
    void oContext.delete("$auto");
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
