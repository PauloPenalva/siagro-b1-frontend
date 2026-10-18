import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import { ValueState } from "sap/ui/core/library";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { openNfeIssueDialog } from "siagrob1/dialogs/NfeIssueDialog";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { sendJson, odataValue, readErrorMessage } from "siagrob1/helpers/FetchHelpers";
import { runNfeAction } from "siagrob1/helpers/NfeActionRunner";
import { canCancelNfe, canSendNfeCorrection, pickNfeCorrectionPrefill, FailedNfeCorrection } from "siagrob1/helpers/NfeHelpers";
import { openNfeCancelDialog } from "siagrob1/dialogs/NfeCancelDialog";
import { runNfeVoidNumber } from "siagrob1/dialogs/NfeVoidNumberAction";
import { NfeReturnRow, prefillNfeReturnRows, hasReturnableBalance, buildNfeReturnPayload } from "siagrob1/helpers/NfeReturnHelpers";
import { IcmsComplementRow, complementRowsFrom, buildIcmsComplementPayload, canComplementIcms } from "siagrob1/helpers/SalesIcmsComplementHelpers";
import { TAX_TOTALS_SELECT } from "siagrob1/helpers/InvoiceTaxTotalsHelpers";
import { LINE_CHARGES_SELECT, summarizeInvoiceCharges } from "siagrob1/helpers/InvoiceChargeTotalsHelpers";
import { openDanfeViewer, openNfeCorrectionViewer } from "siagrob1/dialogs/DanfeViewer";
import { openNfeCorrectionDialog } from "siagrob1/dialogs/NfeCorrectionDialog";
import { Button$PressEvent } from "sap/m/Button";
import Control from "sap/ui/core/Control";
import SapTable from "sap/m/Table";
import { ListBase$UpdateFinishedEvent } from "sap/m/ListBase";
import { Link$PressEvent } from "sap/m/Link";
import { showCteFreights, suspendCteFreights } from "siagrob1/helpers/CteFreightsBinding";

/**
 * @namespace siagrob1.controller.salesInvoices
 */
export default class Detail extends BaseController {

	onInit(): void  {	
		this.getRouter().getRoute("salesInvoicesDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const {id} = ev.getParameter("arguments") as {id: string };
    const uiModel = this.getModel("ui") as JSONModel;

		if (id != null) {

      uiModel.setProperty("/editable", false);
      uiModel.setProperty("/canPickContract", false);
      uiModel.setProperty("/cteFreightCount", 0);
      suspendCteFreights(this.byId("cteFreightsTable") as SapTable);
      // O quadro "Tributos" do documento anterior não pode aparecer enquanto as linhas deste não chegam.
      uiModel.setProperty("/taxTotals", { visible: false, rows: [] });
      uiModel.setProperty("/chargeTotals", summarizeInvoiceCharges([]));

			const sPath = `/SalesInvoices(${id})`;
			// A grade de itens não mostra tributo; sem o $select explícito o autoExpandSelect não os busca e o
			// quadro "Tributos" somaria nada; idem para os quatro valores da seção Totais.
			this.bindElement(sPath, { $expand: `Items($select=${TAX_TOTALS_SELECT},${LINE_CHARGES_SELECT})` });
			this.attachDocumentTotalRefresh();
			showCteFreights(this.byId("cteFreightsTable") as SapTable, "SalesInvoiceKey", id);
			void this.refreshTaxLockFromContext();
			void this.refreshNfeHeaderFromContext();
			void this.refreshNfeReturnFromContext();
			void this.refreshIcmsComplementFromContext();

			return;
		}

	}

	/** A seção "CT-e de frete" só aparece quando há algum. */
	onCteFreightsUpdated(ev: ListBase$UpdateFinishedEvent): void {
		(this.getModel("ui") as JSONModel).setProperty("/cteFreightCount", ev.getParameter("total") ?? 0);
	}

	/** Abre o CT-e de frete da linha da lista. */
	onOpenCteFreight(ev: Link$PressEvent): void {
		const key = (ev.getSource().getBindingContext() as Context)?.getProperty("PurchaseInvoice/Key") as string;
		if (key) this.navTo("purchaseInvoicesDetail", { id: key });
	}

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("salesInvoicesEdit", {id: oContext.getProperty("Key") as string });
    }
  }

  /** Remessa para depósito: volta para a liberação de origem. */
  onOpenShipmentRelease(): void {
    const key = (this.getView().getBindingContext() as Context)?.getProperty("ShipmentReleaseKey") as string;
    if (key) this.navTo("shipmentReleasesDetail", { id: key });
  }

  /** Nota de custódia: volta para o romaneio de origem. */
  onOpenCustodyTransaction(): void {
    const key = (this.getView().getBindingContext() as Context)?.getProperty("CustodyStorageTransactionKey") as string;
    if (key) this.navTo("storageTransactionsDetail", { id: key });
  }

  async onConfirm() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.error("Contexto inválido.")
      return;
    }

    if (await DialogHelper.confirmDialog("Confirmar documento de saída ?")) {
      await this.invokeAction("/SalesInvoicesConfirm(...)", ctx, "Documento de saída confirmado com sucesso.");
    }
  }

  async onIssueNfe() {
    const ctx = this.getView().getBindingContext() as Context;
    // Documento Normal: já confirmado, a NF-e é transmitida. Devolução própria e complemento de ICMS: emitir é o que
    // confirma.
    const verb = ctx?.getProperty("IsNfeReturn") === true || ctx?.getProperty("InvoiceType") === "IcmsComplement"
      ? "Emitir" : "Transmitir";
    if (!ctx) return;
    const series = await openNfeIssueDialog(this.getView(), {
      title: `${verb} NF-e`, message: `${verb} a NF-e deste documento ?`, confirmText: `${verb} NF-e`,
      branchCode: ctx.getProperty("BranchCode") as string,
      documentSeries: ctx.getProperty("TaxDocumentSeries") as string,
      documentNumber: ctx.getProperty("TaxDocumentNumber") as string,
    });
    if (series === null) return;

    await this.runNfeAction(ServerRoutes.salesInvoicesIssueNfe, ctx, { Series: series });
  }

  async onConsultNfe() {
    const ctx = this.getView().getBindingContext() as Context;
    if (ctx) {
      await this.runNfeAction(ServerRoutes.salesInvoicesConsultNfe, ctx);
      this.refreshNfeCorrections();
    }
  }

  async onCompleteNfeConfirmation() {
    const ctx = this.getView().getBindingContext() as Context;
    if (ctx) {
      await this.runNfeAction(ServerRoutes.salesInvoicesCompleteNfeConfirmation, ctx);
    }
  }

  /**
   * Emitir/consultar/concluir: 400 traz a mensagem de pré-condição/prontidão; 200 traz o desfecho
   * (autorizada, rejeitada, denegada, em processamento). O documento é relido nos dois casos.
   */
  private async runNfeAction(url: string, ctx: Context, extra: Record<string, unknown> = {}) {
    this.setBusy(true);
    try {
      await runNfeAction(url, { Key: ctx.getProperty("Key") as string, ...extra });
    } finally {
      try {
        await ctx.requestRefresh();
      } catch {
        // a releitura falhar não pode deixar a tela ocupada
      }
      this.setBusy(false);
    }
  }

  /** DANFE num diálogo, com Baixar no rodapé (DanfeViewer). */
  async onDanfe() {
    await openDanfeViewer(ServerRoutes.danfeReport, this.getView().getBindingContext() as Context);
  }

  async onNfeXml() {
    const ctx = this.getView().getBindingContext() as Context;
    await this.downloadNfeXml(`${ServerRoutes.salesInvoicesNfeXml}(Key=${ctx.getProperty("Key") as string})`,
      `${ctx.getProperty("ChaveNFe") as string}-procNFe.xml`);
  }

  async onCompleteNfeCancellation() {
    const ctx = this.getView().getBindingContext() as Context;
    if (ctx) {
      await this.runNfeAction(ServerRoutes.salesInvoicesCompleteNfeCancellation, ctx);
    }
  }

  async onNfeCancellationXml() {
    const ctx = this.getView().getBindingContext() as Context;
    await this.downloadNfeXml(`${ServerRoutes.salesInvoicesNfeCancellationXml}(Key=${ctx.getProperty("Key") as string})`,
      `${ctx.getProperty("ChaveNFe") as string}-procEventoNFe.xml`);
  }

  async onVoidNfeNumber() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      return;
    }

    if (await runNfeVoidNumber(this.getView(), ServerRoutes.salesInvoicesVoidNfeNumber,
      ctx.getProperty("Key") as string, (busy) => this.setBusy(busy))) {
      try {
        await ctx.requestRefresh();
      } catch {
        // a releitura falhar não pode travar a tela
      }
    }
  }

  async onNfeVoidNumberXml() {
    const ctx = this.getView().getBindingContext() as Context;
    await this.downloadNfeXml(`${ServerRoutes.salesInvoicesNfeVoidNumberXml}(Key=${ctx.getProperty("Key") as string})`,
      `${ctx.getProperty("TaxDocumentSeries") as string}-${ctx.getProperty("TaxDocumentNumber") as string}-procInutNFe.xml`);
  }

  /** Último texto de CC-e recusado, por documento: reabre o diálogo com ele (limpo no sucesso). */
  private _failedNfeCorrection: FailedNfeCorrection;

  /** "Carta de Correção": diálogo pré-preenchido com a última carta; 200 traz a sequência registrada. */
  async onNfeCorrection() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx || !canSendNfeCorrection(ctx.getProperty("NfeStatus") as string, ctx.getProperty("InvoiceStatus") as string)) {
      return;
    }

    const key = ctx.getProperty("Key") as string;
    const last = await sendJson("GET",
      `${ServerRoutes.salesInvoicesNfeCorrections}?$filter=SalesInvoiceKey eq ${key}&$orderby=Sequence desc&$top=1&$select=Text`);
    const previous = last.ok ? (odataValue<{ Text: string }[]>(last.data) ?? [])[0]?.Text ?? "" : "";

    const text = await openNfeCorrectionDialog(this.getView(),
      pickNfeCorrectionPrefill(this._failedNfeCorrection, key, previous));
    if (text === null) {
      return;
    }

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.salesInvoicesSendNfeCorrection, { Key: key, Text: text });
      if (!result.ok) {
        this._failedNfeCorrection = { key, text };
        MessageBox.error(result.message);
        return;
      }

      this._failedNfeCorrection = undefined;
      const outcome = odataValue<{ Sequence: number }>(result.data);
      MessageToast.show(`Carta de correção nº ${outcome.Sequence} registrada na SEFAZ.`);
    } finally {
      this.refreshNfeCorrections();
      this.setBusy(false);
    }
  }

  async onNfeCorrectionXml(event: Button$PressEvent) {
    const row = (event.getSource() as Control).getBindingContext() as Context;
    const ctx = this.getView().getBindingContext() as Context;
    const sequence = row.getProperty("Sequence") as number;
    await this.downloadNfeXml(
      `${ServerRoutes.salesInvoicesNfeCorrectionXml}(Key=${ctx.getProperty("Key") as string},Sequence=${sequence})`,
      `${ctx.getProperty("ChaveNFe") as string}-cce-${sequence}-procEventoNFe.xml`);
  }

  async onNfeCorrectionPdf(event: Button$PressEvent) {
    const row = (event.getSource() as Control).getBindingContext() as Context;
    await openNfeCorrectionViewer(ServerRoutes.danfeReport, this.getView().getBindingContext() as Context,
      row.getProperty("Sequence") as number);
  }

  private refreshNfeCorrections() {
    try {
      (this.byId("nfeCorrectionsTable") as Table)?.getBinding("rows")?.refresh();
    } catch {
      // tabela ainda não carregada: o próximo bind traz as cartas
    }
  }

  private async downloadNfeXml(url: string, fileName: string) {
    this.setBusy(true);
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(await readErrorMessage(response) || "Falha ao baixar o XML.");
      }

      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    } catch (error) {
      MessageBox.error((error as Error)?.message || "Falha ao baixar o XML.");
    } finally {
      this.setBusy(false);
    }
  }

  private _nfeReturnDialog: Dialog;

  /** "Devolver": abre o diálogo com os itens da venda e o saldo devolvível de cada um. */
  async onNfeReturn() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      return;
    }

    let rows: NfeReturnRow[] = [];
    this.setBusy(true);
    try {
      const result = await sendJson(
        "GET", `${ServerRoutes.salesInvoicesNfeReturnableItems}(Key=${ctx.getProperty("Key") as string})`);

      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      rows = odataValue<NfeReturnRow[]>(result.data) ?? [];
    } finally {
      this.setBusy(false);
    }

    if (!hasReturnableBalance(rows)) {
      MessageBox.information("Esta venda não tem saldo a devolver.");
      return;
    }

    this.getView().setModel(new JSONModel({ rows: prefillNfeReturnRows(rows), reason: "", busy: false }), "nfeReturn");

    this._nfeReturnDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.salesInvoices.fragments.NfeReturnDialog");
    this._nfeReturnDialog.open();
  }

  onCloseNfeReturn() {
    this._nfeReturnDialog?.close();
  }

  /** Cria a devolução própria e abre a tela dela, onde fica o "Emitir NF-e". */
  async onConfirmNfeReturn() {
    // Valor digitado que o tipo Float não leu deixa o número anterior no modelo: o Input fica em
    // Error e o que seria enviado não é o que está na tela.
    const invalidInput = this._nfeReturnDialog
      ?.findAggregatedObjects(true, (c) => c.isA("sap.m.Input") && (c as Input).getValueState() === ValueState.Error);

    if (invalidInput?.length) {
      MessageBox.warning("Corrija as quantidades marcadas em vermelho.");
      return;
    }

    const ctx = this.getView().getBindingContext() as Context;
    const model = this.getView().getModel("nfeReturn") as JSONModel;
    const built = buildNfeReturnPayload(
      model.getProperty("/rows") as NfeReturnRow[], model.getProperty("/reason") as string);

    if (built.ok === false) {
      MessageBox.warning(built.message);
      return;
    }

    model.setProperty("/busy", true);
    try {
      const action = (ctx.getModel() as ODataModel).bindContext(ServerRoutes.salesInvoicesCreateNfeReturn);
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("OriginItemKeys", built.payload.OriginItemKeys);
      action.setParameter("Quantities", built.payload.Quantities);
      action.setParameter("Reason", built.payload.Reason);
      await action.invoke();

      const key = action.getBoundContext().getProperty("value") as string;
      this._nfeReturnDialog.close();
      MessageToast.show("Devolução criada. Confira os dados e emita a NF-e.", { closeOnBrowserNavigation: false });
      this.navTo("salesInvoicesDetail", { id: key });
    } catch {
      // O handler global de mensagens do OData (Component) já mostrou o erro do servidor.
    } finally {
      model.setProperty("/busy", false);
    }
  }

  /**
   * Formatter do botão "Complementar ICMS": a mesma regra do servidor (venda Normal, Confirmada, NF-e Autorizada,
   * emitida pelo Siagro). Quem decide de fato é a action; isto só evita oferecer o que voltaria recusado.
   */
  isIcmsComplementAvailable(invoiceType: string, invoiceStatus: string, nfeStatus: string, taxDocumentKind: string,
    taxLocked: boolean): boolean {
    return canComplementIcms({
      InvoiceType: invoiceType, InvoiceStatus: invoiceStatus, NfeStatus: nfeStatus,
      TaxDocumentKind: taxDocumentKind, taxLocked: taxLocked === true,
    });
  }

  private _icmsComplementDialog: Dialog;

  /**
   * "Complementar ICMS": abre o diálogo com os itens da venda, base e ICMS zerados. Os itens vêm das linhas já
   * carregadas na grade (todas: a coleção expandida chega inteira com o documento). O valor da linha é calculado
   * aqui como o servidor faz (quantidade × preço, 2 casas): `Total` é derivado e não entra no $select.
   */
  async onIcmsComplement() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      return;
    }

    const binding = (this.byId("tableSalesInvoicesItems") as Table)?.getBinding("rows") as ODataListBinding;
    const items = (binding?.getAllCurrentContexts() ?? []).map((item) => ({
      Key: item.getProperty("Key") as string,
      ItemCode: item.getProperty("ItemCode") as string,
      ItemName: item.getProperty("ItemName") as string,
      Quantity: Number(item.getProperty("Quantity") ?? 0),
      Total: Math.round(Number(item.getProperty("Quantity") ?? 0) * Number(item.getProperty("UnitPrice") ?? 0) * 100) / 100,
    }));

    if (items.length === 0) {
      MessageBox.information("Esta venda não tem itens para complementar.");
      return;
    }

    this.getView().setModel(new JSONModel({ rows: complementRowsFrom(items), busy: false }), "icmsComplement");

    this._icmsComplementDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.salesInvoices.fragments.IcmsComplementDialog");
    this._icmsComplementDialog.open();
  }

  onCloseIcmsComplement() {
    this._icmsComplementDialog?.close();
  }

  /** Cria o complemento de ICMS e abre a tela dele, onde fica o "Emitir NF-e". */
  async onConfirmIcmsComplement() {
    // Valor que o tipo Float não aceitou (texto, negativo) deixa o número anterior no modelo: o Input fica em Error
    // e o que seria enviado não é o que está na tela.
    const invalidInput = this._icmsComplementDialog
      ?.findAggregatedObjects(true, (c) => c.isA("sap.m.Input") && (c as Input).getValueState() === ValueState.Error);

    if (invalidInput?.length) {
      MessageBox.warning("Corrija os valores marcados em vermelho.");
      return;
    }

    const ctx = this.getView().getBindingContext() as Context;
    const model = this.getView().getModel("icmsComplement") as JSONModel;
    const payload = buildIcmsComplementPayload(model.getProperty("/rows") as IcmsComplementRow[]);

    if (payload.OriginItemKeys.length === 0) {
      MessageBox.warning("Informe a base e o valor do ICMS de ao menos um item.");
      return;
    }

    model.setProperty("/busy", true);
    try {
      const action = (ctx.getModel() as ODataModel).bindContext(ServerRoutes.salesInvoicesCreateIcmsComplement);
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("OriginItemKeys", payload.OriginItemKeys);
      action.setParameter("IcmsBases", payload.IcmsBases);
      action.setParameter("IcmsValues", payload.IcmsValues);
      await action.invoke();

      const key = action.getBoundContext().getProperty("value") as string;
      this._icmsComplementDialog.close();
      MessageToast.show("Complemento de ICMS criado. Confira os valores e emita a NF-e.", { closeOnBrowserNavigation: false });
      this.navTo("salesInvoicesDetail", { id: key });
    } catch {
      // O handler global de mensagens do OData (Component) já mostrou o erro do servidor.
    } finally {
      model.setProperty("/busy", false);
    }
  }

  async onReverse() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.error("Contexto inválido.")
      return;
    }

    if (await DialogHelper.confirmDialog("Estornar documento de saída ?")) {
      await this.invokeAction("/SalesInvoicesReverseConfirm(...)", ctx, "Documento de saída estornado com sucesso.");
    }
  }

  async onCancel() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.error("Contexto inválido.")
      return;
    }

    // NF-e autorizada: o cancelamento vai pela SEFAZ, com justificativa.
    if (canCancelNfe(ctx.getProperty("NfeStatus") as string, ctx.getProperty("InvoiceStatus") as string)) {
      const justification = await openNfeCancelDialog(this.getView());
      if (justification !== null) {
        await this.runNfeAction(ServerRoutes.salesInvoicesCancelNfe, ctx, { Justification: justification });
      }
      return;
    }

    if (await DialogHelper.confirmDialog("Cancelar documento de saída ?")) {
      await this.invokeAction("/SalesInvoicesCancel(...)", ctx, "Documento de saída cancelado com sucesso.");
    }
  }

  /**
   * Confirmar, estornar e cancelar mantêm o operador no detalhe: é dali que ele segue (editar depois
   * do estorno, transmitir depois de confirmar). O documento é relido no lugar — situação e botões
   * dependem dele —, como já faz o runNfeAction.
   */
  private async invokeAction(path: string, ctx: Context, message: string) {
    const action = (ctx.getModel() as ODataModel).bindContext(path);
    action.setParameter("Key", ctx.getProperty("Key"));

    this.setBusy(true);
    try {
      await action.invoke();
      MessageToast.show(message);

      try {
        await ctx.requestRefresh();
      } catch {
        // a releitura falhar não pode deixar a tela ocupada
      }
    } finally {
      this.setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Comentários                                                         */
  /* ------------------------------------------------------------------ */

  private _commentDialog: Dialog;

  /**
   * Comentário selecionado, ou `null` (já avisando o usuário) quando não há seleção.
   */
  private selectedCommentContext(): Context | null {
    const oTable = this.byId("salesInvoiceCommentsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione um comentário.");
      return null;
    }

    return oTable.getContextByIndex(selected) as Context;
  }

  /**
   * Só o autor altera ou exclui o próprio comentário; administrador pode qualquer um. Quem
   * decide de fato é o servidor (ContractCommentRules) - isto só evita oferecer uma ação que
   * voltaria recusada.
   */
  private canModifyComment(oContext: Context): boolean {
    const sessionModel = this.getModel("sessionModel") as JSONModel;

    if (sessionModel?.getProperty("/isAdmin") === true) {
      return true;
    }

    const userName = (sessionModel?.getProperty("/userName") as string) ?? "";
    const author = (oContext.getProperty("CommentedBy") as string) ?? "";

    return userName !== "" && author.toLowerCase() === userName.toLowerCase();
  }

  async onAddComment() {
    if (!this.getView().getBindingContext()) {
      MessageBox.alert("Documento não carregado.");
      return;
    }

    this.prepareCommentDialog("Novo Comentário", "", null);
    await this.openCommentDialog();
  }

  async onEditComment() {
    const oContext = this.selectedCommentContext();
    if (!oContext) {
      return;
    }

    if (!this.canModifyComment(oContext)) {
      MessageBox.alert("Somente o autor do comentário pode alterá-lo.");
      return;
    }

    this.prepareCommentDialog(
      "Editar Comentário",
      oContext.getProperty("CommentText") as string,
      oContext.getProperty("Key") as string
    );

    await this.openCommentDialog();
  }

  /**
   * O diálogo trabalha sobre um buffer JSON, nunca sobre o contexto OData: two-way binding num
   * Detail deixaria um PATCH pendente no update group diferido e derrubaria o batch inteiro.
   * `key` nulo significa inclusão.
   */
  private prepareCommentDialog(title: string, text: string, key: string) {
    (this.getModel("viewModel") as JSONModel).setProperty("/commentDialog", {
      title,
      text: text ?? "",
      key,
    });
  }

  private async openCommentDialog() {
    this._commentDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.salesInvoices.fragments.SalesInvoiceCommentDialog"
    );

    this._commentDialog.open();
  }

  onCloseCommentDialog() {
    this._commentDialog?.close();
  }

  async onConfirmComment() {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const text = ((viewModel.getProperty("/commentDialog/text") as string) ?? "").trim();

    if (text === "") {
      MessageBox.alert("Informe o texto do comentário.");
      return;
    }

    const commentKey = viewModel.getProperty("/commentDialog/key") as string;
    const invoiceKey = (this.getView().getBindingContext() as Context)
      ?.getProperty("Key") as string;

    this.onCloseCommentDialog();
    this.setBusy(true);

    try {
      const oModel = this.getView().getModel() as ODataModel;

      if (commentKey) {
        const action = oModel.bindContext(this.api.salesInvoicesCommentUpdate);
        action.setParameter("Key", commentKey);
        action.setParameter("Text", text);
        await action.invoke();
        MessageToast.show("Comentário alterado.");
      } else {
        const action = oModel.bindContext(this.api.salesInvoicesCommentCreate);
        action.setParameter("InvoiceKey", invoiceKey);
        action.setParameter("Text", text);
        await action.invoke();
        MessageToast.show("Comentário incluído.");
      }

      this.refreshCommentsList();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao gravar o comentário.");
    } finally {
      this.setBusy(false);
    }
  }

  async onRemoveComment() {
    const oContext = this.selectedCommentContext();
    if (!oContext) {
      return;
    }

    if (!this.canModifyComment(oContext)) {
      MessageBox.alert("Somente o autor do comentário pode excluí-lo.");
      return;
    }

    const confirmed = await confirmDialog(
      "Excluir o comentário selecionado ?",
      "Excluir Comentário"
    );

    if (!confirmed) {
      return;
    }

    this.setBusy(true);

    try {
      const oModel = this.getView().getModel() as ODataModel;
      const action = oModel.bindContext(this.api.salesInvoicesCommentDelete);
      action.setParameter("Key", oContext.getProperty("Key") as string);
      await action.invoke();

      MessageToast.show("Comentário excluído.");
      this.refreshCommentsList();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao excluir o comentário.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Recarrega a tabela de comentários (cache próprio, por `$$ownRequest`) e o log de
   * alterações: toda mutação de comentário grava linha no log.
   */
  private refreshCommentsList() {
    const oBinding = (this.byId("salesInvoiceCommentsTable") as Table)
      ?.getBinding("rows") as ODataListBinding;
    oBinding?.refresh();

    const oLogBinding = (this.byId("salesInvoiceChangeLogsTable") as Table)
      ?.getBinding("rows") as ODataListBinding;
    oLogBinding?.refresh();
  }
}
