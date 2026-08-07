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
   * Value help do CONTRATO DE COMPRA da linha — só faz sentido no documento tipo Normal.
   *
   * Não usa o `applyValueHelp` genérico nem `descriptionProperty`: aquele mecanismo copia uma
   * DESCRIÇÃO, e aqui o que precisa ser gravado é a CHAVE do contrato. Segue o mesmo desenho do
   * value help da NF de origem — `setValue` no que a tela mostra, `setProperty` no que o banco
   * guarda.
   *
   * Fornecedor e produto entram como filtro porque o contrato é por par (fornecedor, produto):
   * sem eles o diálogo ofereceria contrato de outro produto, que o servidor recusa na gravação.
   */
  async openContractValueHelp(ev: Input$ValueHelpRequestEvent) {
    const oInput = ev.getSource();
    const oTarget = oInput.getBindingContext() as Context;
    const oInvoice = this.getView().getBindingContext() as Context;

    const cardCode = oInvoice?.getProperty("CardCode") as string;
    const itemCode = oTarget?.getProperty("ItemCode") as string;

    if (!cardCode) {
      MessageBox.warning("Informe o emitente antes de amarrar o contrato.");
      return;
    }

    if (!itemCode) {
      MessageBox.warning("Informe o produto da linha antes de amarrar o contrato.");
      return;
    }

    const oSelected = await DialogHelper.openTableSelectDialog(
      this,
      "PurchaseInvoiceContractsSelectDialog",
      ["Code", "Complement"],
      [
        new Filter("CardCode", FilterOperator.EQ, cardCode),
        new Filter("ItemCode", FilterOperator.EQ, itemCode),
      ]);

    // Cancelar resolve undefined: não mexer no que já estava amarrado.
    if (!oSelected) {
      return;
    }

    oInput.setValue(oSelected.getProperty("Code") as string);
    await oTarget.setProperty("PurchaseContractKey", oSelected.getProperty("Key"));
  }

  /**
   * Value help do PRODUTO da linha.
   *
   * Não usa `.openItemValueHelp` — o genérico do `CommonController`, compartilhado por muitas
   * telas — porque aqui a troca de produto precisa desamarrar o contrato: o guard do servidor só
   * aceita contrato do MESMO produto, e manter a chave apontando para o produto ANTERIOR reprova
   * o Save sem dar ao operador um jeito de corrigir além de apagar a linha inteira.
   */
  async openLineItemValueHelp(ev: Input$ValueHelpRequestEvent) {
    const oTarget = ev.getSource().getBindingContext() as Context;
    const previousItemCode = oTarget?.getProperty("ItemCode") as string;

    await this.applyValueHelp(ev, "ItemsSelectDialog", ["ItemCode", "ItemName"], "ItemCode");

    if (!oTarget || oTarget.getProperty("ItemCode") === previousItemCode) {
      return;
    }

    // Produto mudou: o contrato eventualmente amarrado era válido para o produto ANTERIOR. A
    // célula "Contrato" da grade lê `PurchaseContract/Code` — uma NAVEGAÇÃO — e o cache do
    // cliente não a esvazia sozinho só porque a chave zerou.
    //
    // A ORDEM importa e não é cosmética: `setProperty` no grupo padrão (deferido, vai no PATCH
    // só quando o Save chama `submitBatch`) devolve uma Promise que só resolve NAQUELE momento —
    // dar `await` nela aqui trava esta função até o operador salvar, e a limpeza da navegação
    // (linha seguinte) nunca chegaria a rodar. Por isso a navegação é limpa PRIMEIRO, com grupo
    // `null` (client-only, resolve na hora), e a chave é gravada DEPOIS sem `await` — o valor já
    // fica correto no cache local de imediato, e a gravação de fato acontece no próximo Save.
    await oTarget.setProperty("PurchaseContract/Code", null, null);
    void oTarget.setProperty("PurchaseContractKey", null);
  }

  /** Quantidade ou preço mudou numa linha: o "Total dos itens" acompanha. */
  onItemAmountChange() {
    this.refreshDocumentTotal();
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
