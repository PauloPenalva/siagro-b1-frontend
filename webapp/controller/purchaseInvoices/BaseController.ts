import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * Comum às telas do documento de entrada.
 *
 * @namespace siagrob1.controller.purchaseInvoices
 */
export abstract class BaseController extends CommonController {

  /**
   * Value help da NF de ORIGEM da linha — só faz sentido no documento tipo Devolução.
   *
   * A amarração é manual por limitação do layout da NF-e: as referências vivem em `ide/NFref`,
   * que é do cabeçalho, e o XML não diz qual linha veio de qual origem. O emitente escreve isso
   * em texto livre nas informações do contribuinte, exibidas ao lado da grade.
   *
   * Só são oferecidas linhas do MESMO cliente com quebra apurada em aberto.
   */
  async openOriginItemValueHelp(ev: Input$ValueHelpRequestEvent) {
    const oInput = ev.getSource();
    const oTarget = oInput.getBindingContext() as Context;
    const oInvoice = this.getView().getBindingContext() as Context;

    const cardCode = oInvoice?.getProperty("CardCode") as string;

    if (!cardCode) {
      MessageBox.warning("Informe o emitente antes de amarrar as notas de origem.");
      return;
    }

    const oSelected = await DialogHelper.openTableSelectDialog(
      this,
      "PurchaseInvoiceOriginItemsSelectDialog",
      ["SalesInvoice/InvoiceNumber", "SalesInvoice/TaxDocumentNumber", "ItemName"],
      // O cliente muda a cada documento, então entra na abertura. As demais condições de
      // elegibilidade são fixas e vivem no $filter do fragmento.
      [ new Filter("SalesInvoice/CardCode", FilterOperator.EQ, cardCode) ]);

    // Cancelar resolve undefined: não mexer no que já estava amarrado.
    if (!oSelected) {
      return;
    }

    oInput.setValue(oSelected.getProperty("SalesInvoice/InvoiceNumber") as string);
    await oTarget.setProperty("SalesInvoiceItemKey", oSelected.getProperty("Key"));
  }

  /**
   * Soma das linhas do documento.
   *
   * Calculada NO CLIENTE porque `TotalInvoiceItems` é derivada e, num documento em digitação, o
   * servidor ainda não respondeu nada.
   *
   * Não confundir com `TotalDocumentValue`, que é o total DECLARADO pelo emitente: os dois
   * divergirem é informação de conciliação, não erro.
   */
  protected refreshDocumentTotal() {
    const oTable = this.byId("tablePurchaseInvoiceItems") as Table;
    const oBinding = oTable?.getBinding("rows") as ODataListBinding;
    const uiModel = this.getModel("ui") as JSONModel;

    if (!oBinding || !uiModel) {
      return;
    }

    const total = oBinding.getAllCurrentContexts().reduce((sum, ctx) => {
      const quantity = Number(ctx.getProperty("Quantity") ?? 0);
      const unitPrice = Number(ctx.getProperty("UnitPrice") ?? 0);

      if (isNaN(quantity) || isNaN(unitPrice)) {
        return sum;
      }

      return sum + (quantity * unitPrice);
    }, 0);

    uiModel.setProperty("/totalItems", total.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }));
  }
}
