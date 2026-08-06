import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/**
 * Edição do documento de entrada — cabeçalho e LINHAS.
 *
 * É o caminho que a devolução antiga não tinha: lá o Detail era read-only e o serviço de
 * atualização ignorava a coleção, então amarrar uma linha depois de gravar era impossível.
 *
 * Tipo e emissão ficam travados: mudá-los depois invalidaria as amarrações já feitas.
 *
 * @namespace siagrob1.controller.purchaseInvoices
 */
export default class Edit extends BaseController {
  formatter = { ...formatter }

  onInit(): void {
    this.getRouter().getRoute("purchaseInvoicesEdit")
      .attachPatternMatched((ev) => this.editRouteMatched(ev));
  }

  private editRouteMatched(ev: Route$MatchedEvent) {
    const { id } = ev.getParameter("arguments") as { id: string };

    if (id == null) {
      return;
    }

    this.clearStates("purchaseInvoicesForm");

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/typeEditable", false);

    const oModel = this.getModel() as ODataModel;

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    // $select das linhas explícito por causa de AssessedShortage/Difference: suas colunas só
    // ficam visíveis no tipo Devolução — informação do CABEÇALHO, que ainda não chegou quando o
    // UI5 monta o $select automático. De fora dele, o UI5 busca cada uma depois por
    // `Items({key})/AssessedShortage`, rota que o backend não expõe: 404 e colunas em branco.
    this.bindElement(`/PurchaseInvoices(${id})`, {
      $expand:
        "Items($select=Key,ItemCode,ItemName,UnitOfMeasureCode,Quantity,UnitPrice,Total," +
        "AssessedShortage,Difference,SalesInvoiceItemKey" +
        ";$expand=SalesInvoiceItem($expand=SalesInvoice))",
    });

    // Depois que os dados CHEGAM, não junto do bindElement: o bind é assíncrono e somar aqui
    // percorreria uma lista ainda vazia, deixando "Total dos itens" parado em 0,00 para sempre.
    this.getView().getElementBinding()
      ?.attachEventOnce("dataReceived", () => this.refreshDocumentTotal());
  }

  onAddItem() {
    const oBinding = (this.byId("tablePurchaseInvoiceItems") as Table)
      ?.getBinding("rows") as ODataListBinding;

    if (!oBinding) {
      return;
    }

    // Toda propriedade editável entra no create() inicial, nem que seja como null: sem isso a
    // primeira alteração abre "Must not change a property before it has been read".
    // Decimais vão como NÚMERO — em string o POST volta 400 no vínculo do corpo.
    oBinding.create({
      ItemCode: "", ItemName: "", UnitOfMeasureCode: "",
      Quantity: 0, UnitPrice: 0, SalesInvoiceItemKey: null,
    }, false, false, false);

    this.refreshDocumentTotal();
  }

  async onRemoveItem() {
    const oTable = this.byId("tablePurchaseInvoiceItems") as Table;
    const i = oTable?.getSelectedIndex() ?? -1;

    if (i < 0) {
      MessageBox.warning("Selecione um item.");
      return;
    }

    await (oTable.getContextByIndex(i) as Context).delete();
    this.refreshDocumentTotal();
  }

  async onSave() {
    const oContext = this.getView().getBindingContext() as Context;

    if (!oContext) {
      MessageBox.warning("Documento não carregado.");
      return;
    }

    if (!oContext.getProperty("CardCode")) {
      MessageBox.warning("Informe o emitente do documento.");
      return;
    }

    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        MessageToast.show("Documento alterado.", { closeOnBrowserNavigation: false });
        this.navTo("purchaseInvoicesDetail", { id: oContext.getProperty("Key") as string });
      }
    } finally {
      this.setBusy(false);
    }
  }

  onCancel() {
    const oContext = this.getView().getBindingContext() as Context;
    const oModel = this.getModel() as ODataModel;

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    if (oContext) {
      this.navTo("purchaseInvoicesDetail", { id: oContext.getProperty("Key") as string });
      return;
    }

    this.navTo("purchaseInvoices");
  }
}
