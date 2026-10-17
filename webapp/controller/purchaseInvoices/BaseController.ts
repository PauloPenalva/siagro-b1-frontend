import Table from "sap/ui/table/Table";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
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
import { complementCandidatesPath, isOwnComplement, isPurchaseNfeMode, isPurchaseTaxMode, mustFallBackToNormal, requiresSupplierKey } from "siagrob1/helpers/PurchaseInvoiceNfeHelpers";
import { summarizeInvoiceTaxes, TaxLine } from "siagrob1/helpers/InvoiceTaxTotalsHelpers";
import { formatAmount, lineFunrural, purchaseChargeLineOf, summarizeInvoiceCharges } from "siagrob1/helpers/InvoiceChargeTotalsHelpers";
import {
  complementedItemLabel, complementedItemLabels, complementLineFrom, inheritedContracts, isOtherPurchaseDocument, isOtherPurchaseEligible, isOtherPurchaseUsage,
  missingUnitOfMeasureMessage, toNumber, unitSuggestionToApply, withEntry
} from "siagrob1/helpers/PurchaseInvoiceDraftHelpers";
import Fragment from "sap/ui/core/Fragment";
import TableSelectDialog, { TableSelectDialog$ConfirmEvent, TableSelectDialog$SearchEvent } from "sap/m/TableSelectDialog";
import JSONListBinding from "sap/ui/model/json/JSONListBinding";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataCollection, sendJson } from "siagrob1/helpers/FetchHelpers";
import { PurchaseInvoiceComplementCandidate } from "siagrob1/types/PurchaseInvoiceComplementCandidate";

/** Sequência compartilhada por Add/Edit/Detail: só a chamada mais recente de refreshNfeMode escreve no `ui`. */
let nfeModeSequence = 0;

/** Modo do ERP (STANDALONE?) lido uma vez; undefined = ainda não lido. */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks desligado; undefined = ainda não lido
let isStandaloneErp: boolean | undefined;

/**
 * Naturezas de entrada que são de "outra compra" (serviço, consumo, ativo): não exigem contrato e geram título.
 * Código → true. Vazio fora do STANDALONE; undefined = ainda não lido (uma falha de leitura não é gravada aqui).
 */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks desligado; undefined = ainda não lido
let otherPurchaseUsagesCache: Record<string, boolean> | undefined;

interface UsageFlagsRow {
  Code?: number; code?: number;
  RequiresContract?: boolean; requiresContract?: boolean;
  CreatesFinancialDocument?: boolean; createsFinancialDocument?: boolean;
}

/**
 * Comum às telas do documento de entrada.
 *
 * @namespace siagrob1.controller.purchaseInvoices
 */
/** Última unidade SUGERIDA por linha: permite renovar a sugestão sem tocar na unidade escolhida à mão. */
const lastSuggestedUnit = new WeakMap<Context, string>();

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
      uiModel.setProperty("/isCounterNote", false);
      uiModel.setProperty("/valueComplement", false);
      // Complemento de valor próprio (spec 2026-10-14): a flag e os mapas que a grade lê ("Nota original", contrato
      // herdado e travado (D5) e o código do contrato da linha nova, que não tem a navegação). Do componente: zerados
      // a cada documento.
      uiModel.setProperty("/ownComplement", false);
      uiModel.setProperty("/complementedItemLabels", {});
      uiModel.setProperty("/inheritedContracts", {});
      uiModel.setProperty("/contractCodes", {});
      // Vínculos da contra-nota: só o Detail os preenche (depois de conferir que o documento é o mesmo). O `ui` é do
      // componente, então Incluir/Editar não podem herdar o link do último documento aberto.
      uiModel.setProperty("/counterNote", { key: "", text: "" });
      uiModel.setProperty("/producerInvoice", { key: "", text: "" });
      uiModel.setProperty("/custody", { key: "", code: "" });
      uiModel.setProperty("/otherPurchaseDoc", false);
    }

    // Remessa para depósito (spec backend 2026-10-10 §5.3): só STANDALONE mostra a coluna "Remessa". Depois do reset
    // e guardado por isCurrent(); o modo do ERP é lido uma vez só (cache de módulo).
    await this.refreshStorageDepositMode(uiModel, isCurrent);
    await this.refreshOtherPurchaseUsages(uiModel, isCurrent, reset);

    if (!oContext) {
      return;
    }

    try {
      const branchCode = await oContext.requestProperty("BranchCode") as string;
      const issuerType = await oContext.requestProperty("IssuerType") as string;
      const isNfeReturn = await oContext.requestProperty("IsNfeReturn") === true;
      const invoiceType = await oContext.requestProperty("InvoiceType") as string;
      const cardCode = await oContext.requestProperty("CardCode") as string;
      const paymentConditionCode = await oContext.requestProperty("PaymentConditionCode") as number;
      const producerInvoiceKey = await oContext.requestProperty("ProducerInvoiceKey") as string;
      const custodyKey = await oContext.requestProperty("CustodyStorageTransactionKey") as string;
      const taxLocked = await this.isTaxCalculationActive(branchCode);

      if (!isCurrent()) {
        return;
      }

      void this.refreshCustodyCode(custodyKey, isCurrent);

      const nfeMode = isPurchaseNfeMode(taxLocked, issuerType);
      uiModel.setProperty("/taxLocked", taxLocked);
      uiModel.setProperty("/nfeMode", nfeMode);
      uiModel.setProperty("/nfeReturn", isNfeReturn);
      // Contra-nota (spec 2026-10-10): cabeçalho e linhas vêm da escrituração do produtor e ficam somente leitura.
      uiModel.setProperty("/isCounterNote", !!producerInvoiceKey);
      // Complemento de valor não tem unidade de medida (linha só com valor): a coluna UM deixa de ser obrigatória.
      uiModel.setProperty("/valueComplement", invoiceType === "ValueComplement");
      // Complemento de valor próprio (spec 2026-10-14): "Incluir Item" abre a lista de itens das notas originais.
      const ownComplement = isOwnComplement(nfeMode, invoiceType);
      uiModel.setProperty("/ownComplement", ownComplement);
      if (ownComplement) {
        void this.refreshComplementedItemLabels(cardCode, branchCode, isCurrent);
      }
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
        uiModel.setProperty("/isCounterNote", false);
        uiModel.setProperty("/ownComplement", false);
        uiModel.setProperty("/counterNote", { key: "", text: "" });
        uiModel.setProperty("/producerInvoice", { key: "", text: "" });
        uiModel.setProperty("/custody", { key: "", code: "" });
      }
    }
  }

  /** Código do romaneio de custódia do documento (o EDM só traz a chave). */
  private async refreshCustodyCode(key: string, isCurrent: () => boolean): Promise<void> {
    const uiModel = this.getModel("ui") as JSONModel;
    if (!key) {
      uiModel.setProperty("/custody", { key: "", code: "" });
      return;
    }
    try {
      const code = await (this.getModel() as ODataModel).bindContext(`/StorageTransactions(${key})`).requestObject("Code") as string;
      if (isCurrent()) uiModel.setProperty("/custody", { key, code });
    } catch {
      if (isCurrent()) uiModel.setProperty("/custody", { key, code: key });
    }
  }

  /**
   * Value help do romaneio de custódia: Recepções do mesmo depositante (emitente) e produto da primeira linha. Grava a
   * CHAVE no documento e mostra o código; a etapa pendente é conferida pelo servidor.
   */
  async openCustodyTransactionValueHelp(): Promise<void> {
    const oInvoice = this.getView().getBindingContext() as Context;
    const cardCode = oInvoice.getProperty("CardCode") as string;
    if (!cardCode) {
      MessageBox.warning("Informe o emitente (depositante) antes do romaneio.");
      return;
    }
    const filters = [new Filter("CardCode", FilterOperator.EQ, cardCode)];
    const firstItem = (this.byId("tablePurchaseInvoiceItems") as Table | undefined)?.getContextByIndex?.(0)?.getProperty("ItemCode") as string;
    if (firstItem) filters.push(new Filter("ItemCode", FilterOperator.EQ, firstItem));

    const selected = await DialogHelper.openTableSelectDialog(this, "StorageCustodyTransactionsSelectDialog", ["Code"], filters);
    if (!selected) return;

    // O `ui` primeiro e sem await: a escrita no documento cai no grupo diferido e só resolve no submitBatch.
    (this.getModel("ui") as JSONModel).setProperty("/custody", { key: selected.getProperty("Key") as string, code: selected.getProperty("Code") as string });
    void oInvoice.setProperty("CustodyStorageTransactionKey", selected.getProperty("Key"));
  }

  /** Limpa o romaneio de custódia escolhido (o campo é só value help). */
  onClearCustodyTransaction(): void {
    (this.getModel("ui") as JSONModel).setProperty("/custody", { key: "", code: "" });
    void (this.getView().getBindingContext() as Context).setProperty("CustodyStorageTransactionKey", null);
  }

  onOpenCustodyTransaction(): void {
    const key = (this.getModel("ui") as JSONModel).getProperty("/custody/key") as string;
    if (key) this.navTo("storageTransactionsDetail", { id: key });
  }

  /**
   * Naturezas de "outra compra": `RequiresContract = false` e `CreatesFinancialDocument = true`. Só STANDALONE.
   *
   * Lido por fetch com `$select` explícito (e não do contexto do diálogo de naturezas): o `$select` automático do
   * diálogo só traz as colunas que ele exibe, e ler o resto do contexto escolhido dá "invalid segment".
   */
  protected async loadOtherPurchaseUsages(forceReload = false): Promise<Record<string, boolean>> {
    // A cópia do módulo só serve às ações dentro do mesmo documento; a cada match de rota (reset) o mapa é relido,
    // porque uma natureza criada/alterada no meio da sessão precisa valer na hora.
    if (otherPurchaseUsagesCache && !forceReload) {
      return otherPurchaseUsagesCache;
    }

    try {
      if (isStandaloneErp === undefined) {
        isStandaloneErp = (await this.getSystemInfo())?.erp?.trim().toUpperCase() === "STANDALONE";
      }
      if (!isStandaloneErp) {
        otherPurchaseUsagesCache = {};
        return otherPurchaseUsagesCache;
      }

      const result = await sendJson("GET",
        `${ServerRoutes.usages}?$select=Code,RequiresContract,CreatesFinancialDocument&$top=1000` +
        `&$filter=${encodeURIComponent("Direction eq 'Incoming'")}`);
      if (!result.ok) {
        return {};
      }

      const map: Record<string, boolean> = {};
      for (const row of odataCollection<UsageFlagsRow>(result.data)) {
        const code = row.Code ?? row.code;
        const requiresContract = row.RequiresContract ?? row.requiresContract;
        const createsTitle = row.CreatesFinancialDocument ?? row.createsFinancialDocument;
        if (code !== undefined && requiresContract === false && createsTitle === true) {
          map[String(code)] = true;
        }
      }
      otherPurchaseUsagesCache = map;
      return map;
    } catch {
      // Sem resposta: tudo é grão; a próxima chamada tenta de novo.
      return {};
    }
  }

  /** Publica o mapa de naturezas de outra compra no `ui` e recalcula se o documento inteiro é de outra compra. */
  private async refreshOtherPurchaseUsages(uiModel: JSONModel, isCurrent: () => boolean, forceReload: boolean): Promise<void> {
    const map = await this.loadOtherPurchaseUsages(forceReload);
    if (!isCurrent()) {
      return;
    }
    uiModel.setProperty("/otherPurchaseUsages", map);
    // Há alguma natureza de outra compra (só STANDALONE): libera a coluna "Natureza" também fora do modo de tributos.
    uiModel.setProperty("/hasOtherPurchaseUsages", Object.keys(map).length > 0);
    this.updateOtherPurchaseDocument();
  }

  /** O documento da view pode ser de outra compra? (Normal e não devolução, como no servidor.) */
  protected isOtherPurchaseEligibleDocument(): boolean {
    const invoice = this.getView().getBindingContext() as Context;
    return isOtherPurchaseEligible(invoice?.getProperty("InvoiceType"), invoice?.getProperty("IsNfeReturn"));
  }

  /** A linha tem natureza de outra compra? */
  protected isOtherPurchaseLine(line: Context): boolean {
    const map = (this.getModel("ui") as JSONModel).getProperty("/otherPurchaseUsages") as Record<string, boolean>;
    return this.isOtherPurchaseEligibleDocument() && isOtherPurchaseUsage(line.getProperty("UsageCode"), map);
  }

  /**
   * `/otherPurchaseDoc`: todas as linhas são de outra compra. Governa a seção "Retenções". Barato e síncrono: roda a
   * cada atualização da grade e a cada troca de natureza.
   */
  protected updateOtherPurchaseDocument(): void {
    const uiModel = this.getModel("ui") as JSONModel;
    const binding = (this.byId("tablePurchaseInvoiceItems") as Table | undefined)?.getBinding("rows") as ODataListBinding;
    if (!uiModel || !binding) {
      return;
    }

    const map = uiModel.getProperty("/otherPurchaseUsages") as Record<string, boolean>;
    const codes = binding.getAllCurrentContexts().map((line) => line.getProperty("UsageCode") as unknown);
    const invoice = this.getView().getBindingContext() as Context;
    const invoiceType = invoice?.getProperty("InvoiceType") as unknown;
    const isNfeReturn = invoice?.getProperty("IsNfeReturn") as unknown;
    const isOther = isOtherPurchaseDocument(invoiceType, isNfeReturn, codes, map);
    if (uiModel.getProperty("/otherPurchaseDoc") !== isOther) {
      uiModel.setProperty("/otherPurchaseDoc", isOther);
    }
    // A trava do contrato e o value help de produto por linha só valem em documento Normal que não é devolução.
    const eligible = isOtherPurchaseEligible(invoiceType, isNfeReturn);
    if (uiModel.getProperty("/otherPurchaseEligible") !== eligible) {
      uiModel.setProperty("/otherPurchaseEligible", eligible);
    }
  }

  /**
   * Editar qualquer valor retido passa a valer como digitado: o servidor deixa de recalcular pelas alíquotas
   * (`WithholdingsManual`). A propriedade é lida pelo CheckBox do formulário (entra no `$select`); sem isso o UI5
   * recusaria a escrita ("Must not change a property before it has been read"). Sem await: grupo diferido.
   */
  onWithholdingChange(): void {
    const invoice = this.getView().getBindingContext() as Context;
    if (invoice && invoice.getProperty("WithholdingsManual") !== true) {
      void invoice.setProperty("WithholdingsManual", true);
    }
  }

  private async refreshStorageDepositMode(uiModel: JSONModel, isCurrent: () => boolean): Promise<void> {
    if (isStandaloneErp === undefined) {
      try {
        isStandaloneErp = (await this.getSystemInfo())?.erp?.trim().toUpperCase() === "STANDALONE";
      } catch {
        // Sem resposta: sem a coluna; a próxima chamada tenta de novo.
        if (isCurrent()) uiModel.setProperty("/storageDepositMode", false);
        return;
      }
    }
    if (isCurrent()) {
      uiModel.setProperty("/storageDepositMode", isStandaloneErp);
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
    void this.refreshNfeMode(false).then(() => this.dropBlankLinesForOwnComplement());
  }

  /** Trocar o tipo (Normal/Devolução) do terceiro liga ou desliga o cálculo: a devolução do cliente não tem natureza. */
  onInvoiceTypeChange() {
    this.clearHiddenAmountColumns();
    void this.refreshNfeMode(false).then(() => this.dropBlankLinesForOwnComplement());
  }

  /**
   * Complemento próprio em digitação (spec 2026-10-14): a linha em branco do rascunho não tem item original e voltaria
   * recusada (C1); as linhas nascem do "Incluir Item".
   */
  private dropBlankLinesForOwnComplement(): void {
    const ui = this.getModel("ui") as JSONModel;
    if (ui.getProperty("/ownComplement") !== true || ui.getProperty("/typeEditable") !== true) {
      return;
    }

    const binding = (this.byId("tablePurchaseInvoiceItems") as Table | undefined)?.getBinding("rows") as ODataListBinding;
    for (const ctx of binding?.getAllCurrentContexts?.() ?? []) {
      if (ctx.isTransient() && !ctx.getProperty("ItemCode") && !ctx.getProperty("ComplementedItemKey")) {
        void ctx.delete();
      }
    }
    this.refreshDocumentTotal();
  }

  /**
   * Complemento de valor (D11): a troca de tipo esconde Quantidade/Preço (ou o Valor do complemento). O valor escondido
   * seria somado no total e o servidor o recusaria (P11), então zera o que deixou de valer em cada linha.
   */
  private clearHiddenAmountColumns() {
    const invoiceType = this.getView().getBindingContext()?.getProperty("InvoiceType") as string;
    const binding = (this.byId("tablePurchaseInvoiceItems") as Table | undefined)?.getBinding("rows") as ODataListBinding;
    for (const ctx of binding?.getAllCurrentContexts?.() ?? []) {
      if (invoiceType === "ValueComplement") {
        void ctx.setProperty("Quantity", 0);
        void ctx.setProperty("UnitPrice", 0);
      } else {
        if (toNumber(ctx.getProperty("ComplementAmount")) !== 0) {
          void ctx.setProperty("ComplementAmount", 0);
        }
        // Fora do complemento o vínculo com a nota original é recusado (C7): sai junto com o valor.
        if (ctx.getProperty("ComplementedItemKey")) {
          void ctx.setProperty("ComplementedItemKey", null);
        }
      }
    }
    this.refreshDocumentTotal();
  }

  /** Link "Contra-nota" na escrituração. */
  onOpenCounterNote() {
    const key = (this.getModel("ui") as JSONModel).getProperty("/counterNote/key") as string;
    if (key) {
      this.navTo("purchaseInvoicesDetail", { id: key });
    }
  }

  /** Link "Escrituração" na contra-nota. */
  onOpenProducerInvoice() {
    const key = (this.getModel("ui") as JSONModel).getProperty("/producerInvoice/key") as string;
    if (key) {
      this.navTo("purchaseInvoicesDetail", { id: key });
    }
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
    const usageCode = oSelected.getProperty("Code") as number;
    void oTarget.setProperty("UsageCode", usageCode);

    // Natureza de outra compra não aceita contrato (o servidor recusa): desamarra o que estiver na linha. Mesma ordem
    // do `openLineItemValueHelp` — navegação com grupo `null` primeiro (resolve na hora), chave depois sem `await`.
    const ui = this.getModel("ui") as JSONModel;
    const map = await this.loadOtherPurchaseUsages();
    ui.setProperty("/otherPurchaseUsages", map);
    if (this.isOtherPurchaseEligibleDocument() && isOtherPurchaseUsage(usageCode, map) && oTarget.getProperty("PurchaseContractKey")) {
      await oTarget.setProperty("PurchaseContract/Code", null, null);
      void oTarget.setProperty("PurchaseContractKey", null);
    }
    this.updateOtherPurchaseDocument();
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

  /** Value help da REMESSA PARA DEPÓSITO da linha de retorno: remessas ativas do armazém emitente do documento. */
  async openRemittanceItemValueHelp(ev: Input$ValueHelpRequestEvent) {
    const oInput = ev.getSource();
    const oTarget = oInput.getBindingContext() as Context;
    const cardCode = (this.getView().getBindingContext() as Context)?.getProperty("CardCode") as string;

    if (!cardCode) {
      MessageBox.warning("Informe o emitente (o armazém) antes de indicar a remessa.");
      return;
    }

    const oSelected = await DialogHelper.openTableSelectDialog(
      this, "StorageRemittanceItemsSelectDialog", ["SalesInvoice/InvoiceNumber", "SalesInvoice/TaxDocumentNumber", "ItemName"],
      [new Filter("SalesInvoice/CardCode", FilterOperator.EQ, cardCode)]);

    if (!oSelected) {
      return;
    }

    oInput.setValue((oSelected.getProperty("SalesInvoice/TaxDocumentNumber") || oSelected.getProperty("SalesInvoice/InvoiceNumber") || "") as string);
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

    // A célula lê o mapa antes da navegação (draft.formatContractCode): grava o código ANTES da chave, senão a
    // reavaliação disparada pela chave apagaria o que o setValue escreveu.
    const ui = this.getModel("ui") as JSONModel;
    ui.setProperty("/contractCodes", withEntry(
      ui.getProperty("/contractCodes") as Record<string, string>, oSelected.getProperty("Key") as string,
      oSelected.getProperty("Code") as string));
    oInput.setValue(oSelected.getProperty("Code") as string);
    await oTarget.setProperty("PurchaseContractKey", oSelected.getProperty("Key"));
  }

  /**
   * B7: ao escolher o produto, sugere a unidade da linha — a unidade comercial do complemento do produto ou, sem ela, a
   * padrão do sistema. Roda sem `await` (a leitura do complemento não pode atrasar a limpeza do contrato). A unidade que
   * o operador escolheu à mão nunca é sobrescrita; uma sugestão anterior é renovada quando o produto muda, e a resposta
   * de um produto que já foi trocado é descartada (ver `unitSuggestionToApply`).
   */
  private async suggestUnitOfMeasure(line: Context): Promise<void> {
    const requestedItemCode = line.getProperty("ItemCode") as string;

    let commercial: string;
    try {
      const model = this.getModel() as ODataModel;
      const func = model.bindContext(this.api.itemsGetComplement);
      func.setParameter("ItemCode", requestedItemCode);
      await func.invoke();
      commercial = (func.getBoundContext().getObject() as { CommercialUnitOfMeasureCode?: string })
        ?.CommercialUnitOfMeasureCode;
    } catch {
      // Sem complemento legível, cai na unidade padrão.
      commercial = undefined;
    }

    const suggested = unitSuggestionToApply(
      requestedItemCode, line.getProperty("ItemCode") as string, line.getProperty("UnitOfMeasureCode") as string,
      lastSuggestedUnit.get(line), commercial, this.getSystemSetup().DefaultUoM);

    if (suggested) {
      lastSuggestedUnit.set(line, suggested);
      // Sem `await`, como a chave do contrato: no grupo deferido a Promise só resolve no Save.
      void line.setProperty("UnitOfMeasureCode", suggested);
    }
  }

  /** Mensagem do Save para linha sem unidade de medida (vazio = todas informadas). Ver `missingUnitOfMeasureMessage`. */
  protected missingUnitOfMeasure(lines: Context[], invoiceType?: string): string {
    // Devolução com NF-e e contra-nota: a unidade vem da origem e a tela a trava; o servidor também não a exige aqui.
    const ui = this.getModel("ui") as JSONModel;
    if (ui.getProperty("/nfeReturn") === true || ui.getProperty("/isCounterNote") === true) {
      return "";
    }
    return missingUnitOfMeasureMessage(
      lines.map((line) => ({
        ItemCode: line.getProperty("ItemCode") as string,
        UnitOfMeasureCode: line.getProperty("UnitOfMeasureCode") as string,
      })),
      invoiceType);
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

    // Linha de outra compra (serviço, consumo, ativo): qualquer produto ativo; a de grão segue só com o grupo de grão.
    const otherPurchase = this.isOtherPurchaseEligibleDocument()
      && isOtherPurchaseUsage(oTarget?.getProperty("UsageCode"), await this.loadOtherPurchaseUsages());
    await this.applyValueHelp(
      ev, otherPurchase ? "ActiveItemsSelectDialog" : "ItemsSelectDialog", ["ItemCode", "ItemName"], "ItemCode");

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

    void this.suggestUnitOfMeasure(oTarget).catch((): void => undefined);
  }

  private complementDialog: TableSelectDialog;

  /** Complemento de valor de emissão própria em edição: "Incluir Item" escolhe o item da nota original (spec 2026-10-14). */
  protected isOwnComplementDraft(): boolean {
    return (this.getModel("ui") as JSONModel).getProperty("/ownComplement") === true;
  }

  /**
   * "Incluir Item" no complemento de valor próprio: a linha nasce do item escolhido, com produto, unidade e natureza
   * herdados e travados, o contrato herdado e travado quando o original tem (sem contrato, o operador escolhe: D5),
   * quantidade e preço 0 e o foco no "Valor do complemento".
   */
  protected async addOwnComplementLine(binding: ODataListBinding): Promise<void> {
    const invoice = this.getView().getBindingContext() as Context;
    const cardCode = invoice?.getProperty("CardCode") as string;

    if (!cardCode) {
      MessageBox.warning("Informe o fornecedor antes de incluir itens.");
      return;
    }

    const candidate = await this.pickComplementCandidate(cardCode, invoice.getProperty("BranchCode") as string);
    if (!candidate) {
      return;
    }

    // Antes do create: "Contrato" e "Nota original" leem estes mapas (a linha nova não tem as navegações). Original com
    // contrato: o contrato vem herdado e a célula trava (D5); sem contrato, a célula fica editável e o operador escolhe.
    const ui = this.getModel("ui") as JSONModel;
    ui.setProperty("/contractCodes", withEntry(
      ui.getProperty("/contractCodes") as Record<string, string>, candidate.PurchaseContractKey, candidate.PurchaseContractCode));
    ui.setProperty("/inheritedContracts", withEntry(
      ui.getProperty("/inheritedContracts") as Record<string, string>,
      candidate.PurchaseContractKey ? candidate.ItemKey : "", candidate.PurchaseContractKey));
    ui.setProperty("/complementedItemLabels", withEntry(
      ui.getProperty("/complementedItemLabels") as Record<string, string>, candidate.ItemKey,
      complementedItemLabel(candidate.InvoiceNumber, candidate.LineNumber)));

    const created = binding.create(complementLineFrom(candidate), false, false, false);
    this.refreshDocumentTotal();
    this.focusComplementAmount(created);
  }

  /**
   * Lista os itens elegíveis e resolve com o escolhido, ou undefined ao cancelar (o contrato do openTableSelectDialog,
   * que aqui não serve: a lista vem de uma function, num JSONModel).
   */
  private async pickComplementCandidate(
    cardCode: string, branchCode: string
  ): Promise<PurchaseInvoiceComplementCandidate> {
    const result = await sendJson("GET",
      complementCandidatesPath(ServerRoutes.purchaseInvoicesGetComplementCandidates, cardCode, branchCode));

    if (!result.ok) {
      MessageBox.error(result.message);
      return undefined;
    }

    // A view morre ao navegar (clearControlAggregation) e leva o diálogo junto: recria quando preciso.
    if (!this.complementDialog || this.complementDialog.isDestroyed()) {
      this.complementDialog = await Fragment.load({
        name: "siagrob1.view.purchaseInvoices.fragments.ComplementCandidatesDialog",
        controller: this,
        id: this.getView().getId(),
      }) as TableSelectDialog;
      this.complementDialog.setModel(new JSONModel({ rows: [] }), "candidates");
      this.getView().addDependent(this.complementDialog);
    }

    const dialog = this.complementDialog;
    (dialog.getModel("candidates") as JSONModel).setData({
      rows: odataCollection<PurchaseInvoiceComplementCandidate>(result.data),
    });
    (dialog.getBinding("items") as JSONListBinding)?.filter([]);

    return new Promise((resolve) => {
      // Ligados por abertura e desligados no primeiro disparo: o diálogo é reaproveitado.
      const finish = (row?: PurchaseInvoiceComplementCandidate) => {
        dialog.detachConfirm(onConfirm);
        dialog.detachCancel(onCancel);
        resolve(row);
      };
      const onConfirm = (ev: TableSelectDialog$ConfirmEvent) =>
        finish(ev.getParameter("selectedItem")?.getBindingContext("candidates")?.getObject() as PurchaseInvoiceComplementCandidate);
      const onCancel = () => finish(undefined);

      dialog.attachConfirm(onConfirm);
      dialog.attachCancel(onCancel);
      dialog.open("");
    });
  }

  /** Busca do diálogo, no cliente (a lista já veio inteira): nota, produto ou contrato. */
  onComplementCandidateSearch(ev: TableSelectDialog$SearchEvent): void {
    const value = (ev.getParameter("value") ?? "").trim();
    const binding = ev.getSource().getBinding("items") as JSONListBinding;

    binding.filter(value
      ? [new Filter({
          filters: ["InvoiceNumber", "ItemCode", "ItemName", "PurchaseContractCode"]
            .map((path) => new Filter(path, FilterOperator.Contains, value)),
          and: false,
        })]
      : []);
  }

  /** "Nota original" e contrato herdado das linhas já gravadas (Detail/Edit), lidos da mesma function do diálogo. */
  private async refreshComplementedItemLabels(cardCode: string, branchCode: string, isCurrent: () => boolean): Promise<void> {
    if (!cardCode || !branchCode) {
      return;
    }

    const result = await sendJson("GET",
      complementCandidatesPath(ServerRoutes.purchaseInvoicesGetComplementCandidates, cardCode, branchCode));

    if (!isCurrent() || !result.ok) {
      return;
    }

    const rows = odataCollection<PurchaseInvoiceComplementCandidate>(result.data);
    const ui = this.getModel("ui") as JSONModel;
    ui.setProperty("/complementedItemLabels", complementedItemLabels(rows));
    ui.setProperty("/inheritedContracts", inheritedContracts(rows));
  }

  /** Foco no "Valor do complemento" da linha criada. getCells() pula coluna invisível: a célula é achada pelo binding. */
  private focusComplementAmount(line: Context): void {
    const table = this.byId("tablePurchaseInvoiceItems") as Table;

    table?.attachEventOnce("rowsUpdated", () => {
      const row = table.getRows().find((r) => r.getBindingContext() === line);
      row?.getCells().find((cell) => cell.getBinding("value")?.getPath() === "ComplementAmount")?.focus();
    });
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
    const funrural = contexts.reduce((total, ctx) => total + lineFunrural(ctx), 0);
    // Devolução de compra: o líquido é a receber e o Funrural é estornado. O contexto pai da grade é o cabeçalho.
    const isReturn = (oBinding.getContext() as Context | undefined)?.getProperty("IsNfeReturn") === true;
    const charges = summarizeInvoiceCharges(contexts.map((ctx) => purchaseChargeLineOf(ctx)), funrural, isReturn);
    // Outra compra: o único "Líquido a pagar" é o da seção Retenções (desconta as retenções); a barra de Totais não o repete.
    this.updateOtherPurchaseDocument();
    if (uiModel.getProperty("/otherPurchaseDoc") === true) {
      charges.rows = charges.rows.filter((row) => row.Label !== "Líquido a pagar");
    }

    uiModel.setProperty("/documentTotal", formatAmount(charges.grandTotal));
    uiModel.setProperty("/chargeTotals", charges);
    uiModel.setProperty("/taxTotals", summarizeInvoiceTaxes(contexts.map((ctx) => ctx.getObject() as TaxLine)));
    this.updateOtherPurchaseDocument();
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
