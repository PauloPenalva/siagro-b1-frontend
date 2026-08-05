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
 * Comum às telas de devolução de cliente.
 *
 * @namespace siagrob1.controller.customerReturns
 */
export abstract class BaseController extends CommonController {

  /**
   * Value help da NF de ORIGEM da linha devolvida.
   *
   * A amarração é manual por limitação do layout da NF-e: as referências vivem em
   * `ide/NFref`, que é do cabeçalho, e o XML não diz qual linha veio de qual origem. O
   * cliente escreve isso em texto livre nas informações do contribuinte, exibidas ao lado.
   *
   * Só são oferecidas linhas do MESMO cliente com quebra apurada em aberto — o filtro é do
   * servidor, na função CustomerReturnsOriginItems.
   */
  async openOriginItemValueHelp(ev: Input$ValueHelpRequestEvent) {
    const oInput = ev.getSource();
    const oTarget = oInput.getBindingContext() as Context;
    const oReturn = this.getView().getBindingContext() as Context;

    const cardCode = oReturn?.getProperty("CardCode") as string;

    if (!cardCode) {
      MessageBox.warning("Importe o XML antes de amarrar as notas de origem.");
      return;
    }

    const oSelected = await DialogHelper.openTableSelectDialog(
      this,
      "CustomerReturnOriginItemsSelectDialog",
      ["SalesInvoice/InvoiceNumber", "SalesInvoice/TaxDocumentNumber", "ItemName"],
      // O cliente muda a cada devolução, então entra na abertura. As demais condições de
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
   * Soma do que está sendo devolvido. Calculado no cliente porque num documento em digitação
   * o servidor ainda não respondeu nada.
   */
  protected refreshTotalReturned() {
    const oTable = this.byId("tableCustomerReturnItems") as Table;
    const oBinding = oTable?.getBinding("rows") as ODataListBinding;
    const uiModel = this.getModel("ui") as JSONModel;

    if (!oBinding || !uiModel) {
      return;
    }

    const total = oBinding.getAllCurrentContexts().reduce((sum, ctx) => {
      const quantity = Number(ctx.getProperty("Quantity") ?? 0);

      return sum + (isNaN(quantity) ? 0 : quantity);
    }, 0);

    uiModel.setProperty("/totalReturned", total.toLocaleString("pt-BR", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }));
  }
}
