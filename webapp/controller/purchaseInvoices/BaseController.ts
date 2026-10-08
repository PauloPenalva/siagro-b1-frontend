import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import CommonController from "siagrob1/controller/common/CommonController";
import { isPurchaseNfeMode, isPurchaseTaxMode, mustFallBackToNormal, requiresSupplierKey } from "siagrob1/helpers/PurchaseInvoiceNfeHelpers";
import { summarizeInvoiceTaxes, TaxLine } from "siagrob1/helpers/InvoiceTaxTotalsHelpers";
import { chargeLineOf, formatAmount, summarizeInvoiceCharges } from "siagrob1/helpers/InvoiceChargeTotalsHelpers";

/** Sequência compartilhada por Add/Edit/Detail: só a chamada mais recente de refreshNfeMode escreve no `ui`. */
let nfeModeSequence = 0;

/**
 * Comum às telas do documento de entrada.
 *
 * @namespace siagrob1.controller.purchaseInvoices
 */
export abstract class BaseController extends CommonController {

  private itemFiscalDialog: Dialog;

  private documentTotalAttached = false;

  /**
   * Modo NF-e do documento ligado à view: filial que emite pelo Siagro (`/taxLocked`), emissão própria
   * (`/nfeMode`), cálculo de tributos e natureza (`/taxMode`: própria e terceiro Normal); devolução de compra
   * (`/nfeReturn`); nome da condição de pagamento.
   *
   * O modelo `ui` é do componente e as três telas (Add/Edit/Detail) escrevem nele, então uma chamada lenta
   * não pode sobrescrever a de um documento mais novo: cada chamada tira um número de sequência e, depois de
   * cada espera, só segue se ainda for a mais recente e o contexto da view for o mesmo.
   *
   * `reset`: zera as flags antes de esperar. Certo na troca de rota/documento (um true velho não pode aparecer
   * no documento de outra filial); errado depois de uma ação no mesmo documento (a seção e os botões piscariam).
   */
  protected async refreshNfeMode(reset = true): Promise<void> {
    const sequence = ++nfeModeSequence;
    const uiModel = this.getModel("ui") as JSONModel;
    const oContext = this.getView().getBindingContext() as Context;
    const isCurrent = () => sequence === nfeModeSequence && this.getView().getBindingContext() === oContext;

    if (reset || !oContext) {
      uiModel.setProperty("/taxLocked", false);
      uiModel.setProperty("/nfeMode", false);
      uiModel.setProperty("/nfeReturn", false);
      uiModel.setProperty("/taxMode", false);
    }

    if (!oContext) {
      return;
    }

    try {
      const branchCode = await oContext.requestProperty("BranchCode") as string;
      const issuerType = await oContext.requestProperty("IssuerType") as string;
      const isNfeReturn = await oContext.requestProperty("IsNfeReturn") === true;
      const invoiceType = await oContext.requestProperty("InvoiceType") as string;
      const paymentConditionCode = await oContext.requestProperty("PaymentConditionCode") as number;
      const taxLocked = await this.isTaxCalculationActive(branchCode);

      if (!isCurrent()) {
        return;
      }

      const nfeMode = isPurchaseNfeMode(taxLocked, issuerType);
      uiModel.setProperty("/taxLocked", taxLocked);
      uiModel.setProperty("/nfeMode", nfeMode);
      uiModel.setProperty("/nfeReturn", isNfeReturn);
      // Natureza, CFOP, "Tributos do item", condição de pagamento e Transporte: própria e terceiro Normal, com a
      // mesma tela (spec terceiro-chave D1).
      const taxMode = isPurchaseTaxMode(taxLocked, issuerType, invoiceType);
      uiModel.setProperty("/taxMode", taxMode);

      // No modo NF-e o tipo fica travado em Normal (a devolução de compra própria é feita pelo "Devolver"); uma
      // Devolução escolhida antes de a emissão virar Própria volta para Normal. setProperty sem await: grupo diferido.
      if (mustFallBackToNormal(invoiceType, isNfeReturn, nfeMode, uiModel.getProperty("/typeEditable") === true)) {
        void oContext.setProperty("InvoiceType", "Normal");
        MessageToast.show("Na filial que emite NF-e pelo Siagro, a devolução de compra é feita pelo botão Devolver, no detalhe do documento de entrada.");
      }

      // O nome da condição aparece com a condição (própria e terceiro Normal) e fora da devolução de compra (que não
      // tem pagamento).
      if (taxMode && !isNfeReturn) {
        await this.refreshPaymentConditionName(paymentConditionCode);
      } else {
        uiModel.setProperty("/paymentConditionName", "");
      }
    } catch {
      if (isCurrent()) {
        uiModel.setProperty("/taxLocked", false);
        uiModel.setProperty("/nfeMode", false);
        uiModel.setProperty("/nfeReturn", false);
        uiModel.setProperty("/taxMode", false);
      }
    }
  }

  /**
   * A chave da NF-e do fornecedor é obrigatória (terceiro Normal do tipo NF-e na filial que emite pelo Siagro) e
   * está em branco. Quem decide de verdade é o servidor; isto evita o ida e volta.
   */
  protected isSupplierKeyMissing(oContext: Context): boolean {
    const doc = {
      IssuerType: oContext.getProperty("IssuerType") as string,
      InvoiceType: oContext.getProperty("InvoiceType") as string,
      TaxDocumentKind: oContext.getProperty("TaxDocumentKind") as string,
    };
    const taxLocked = (this.getModel("ui") as JSONModel).getProperty("/taxLocked") === true;

    return requiresSupplierKey(doc, taxLocked) && !((oContext.getProperty("ChaveNFe") as string) ?? "").trim();
  }

  /** Trocar a filial ou a emissão muda o modo NF-e (a natureza e os tributos passam a valer, ou deixam). */
  onBranchChange() {
    void this.refreshNfeMode(false);
  }

  onIssuerTypeChange() {
    void this.refreshNfeMode(false);
  }

  /** Trocar o tipo (Normal/Devolução) do terceiro liga ou desliga o cálculo: a devolução do cliente não tem natureza. */
  onInvoiceTypeChange() {
    void this.refreshNfeMode(false);
  }

  /**
   * Natureza da LINHA da entrada que calcula tributos (própria e terceiro Normal): só naturezas de Entrada ativas ($filter estático do enum). O Input
   * mostra o nome (`UsageName`) e quem vale para o servidor é o `UsageCode`; os tributos aparecem depois de
   * salvar (o cálculo é do servidor). setProperty sem await: o grupo é diferido.
   */
  async openPurchaseUsageValueHelp(ev: Input$ValueHelpRequestEvent) {
    const oInput = ev.getSource();
    const oTarget = oInput.getBindingContext() as Context;

    const oSelected = await DialogHelper.openTableSelectDialog(
      this, "UsagesSelectDialog", ["Name", "Description"],
      [new Filter("Inactive", FilterOperator.EQ, false)], undefined, "Direction eq 'Incoming'");

    if (!oSelected) {
      return;
    }

    oInput.setValue(oSelected.getProperty("Name") as string);
    void oTarget.setProperty("UsageCode", oSelected.getProperty("Code"));
  }

  /** Tributos calculados do item selecionado (somente leitura). */
  async onOpenItemFiscal() {
    const oTable = this.byId("tablePurchaseInvoiceItems") as Table;
    const i = oTable.getSelectedIndices()[0] ?? -1;

    if (i < 0) {
      MessageBox.alert("Selecione um item.");
      return;
    }

    const oItemContext = oTable.getContextByIndex(i) as Context;
    this.itemFiscalDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.purchaseInvoices.fragments.ItemFiscalDialog", oItemContext);
    this.itemFiscalDialog.setBindingContext(oItemContext);
    this.itemFiscalDialog.open();
  }

  onCloseItemFiscal() {
    this.itemFiscalDialog?.close();
  }

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

  /** Quantidade, preço ou um dos quatro valores da linha mudou: o "Total geral" acompanha. */
  onItemAmountChange() {
    this.refreshDocumentTotal();
  }

  /**
   * Total geral do documento (itens + frete + seguro + outras despesas − desconto, spec 2026-10-05 D2) e a seção
   * "Totais" do Detail (`/chargeTotals`).
   *
   * Calculado NO CLIENTE porque `GrandTotal` é derivado e, num documento em digitação, o servidor ainda não respondeu
   * nada.
   *
   * Não confundir com `TotalDocumentValue`, que é o total DECLARADO pelo emitente: na filial que emite pelo Siagro o
   * servidor o grava igual a este; fora dela, os dois divergirem é informação de conciliação, não erro.
   *
   * Recalcula também o quadro "Tributos" do Detail (`/taxTotals`), que soma as mesmas linhas.
   */
  protected refreshDocumentTotal() {
    const oTable = this.byId("tablePurchaseInvoiceItems") as Table;
    const oBinding = oTable?.getBinding("rows") as ODataListBinding;
    const uiModel = this.getModel("ui") as JSONModel;

    if (!oBinding || !uiModel) {
      return;
    }

    const contexts = oBinding.getAllCurrentContexts();
    const charges = summarizeInvoiceCharges(contexts.map((ctx) => chargeLineOf(ctx)));

    uiModel.setProperty("/documentTotal", formatAmount(charges.grandTotal));
    uiModel.setProperty("/chargeTotals", charges);
    uiModel.setProperty("/taxTotals", summarizeInvoiceTaxes(contexts.map((ctx) => ctx.getObject() as TaxLine)));
  }

  /**
   * Recalcula o total sempre que a grade atualiza as linhas — é o que faz o número aparecer na edição e na
   * visualização, onde os itens chegam do servidor e não da digitação. Idempotente: navegar de novo não empilha
   * listeners.
   *
   * Vai na TABELA (`rowsUpdated`), e não em evento de binding: cada `bindElement` de outro documento troca os bindings
   * por objetos novos (um `change` anexado ao de `{Items}` morre com ele — foi o que zerava a saída), e o
   * `dataReceived` do cabeçalho não garante que a grade já tenha os contextos das linhas quando dispara.
   */
  protected attachDocumentTotalRefresh() {
    if (this.documentTotalAttached) {
      return;
    }

    const oTable = this.byId("tablePurchaseInvoiceItems") as Table;

    if (!oTable) {
      return;
    }

    oTable.attachRowsUpdated(() => this.refreshDocumentTotal());
    this.documentTotalAttached = true;
  }
}
