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
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { sendJson, odataValue, readErrorMessage } from "siagrob1/helpers/FetchHelpers";
import { runNfeAction } from "siagrob1/helpers/NfeActionRunner";
import { canCancelNfe, canSendNfeCorrection, pickNfeCorrectionPrefill, FailedNfeCorrection } from "siagrob1/helpers/NfeHelpers";
import { openNfeCancelDialog } from "siagrob1/dialogs/NfeCancelDialog";
import { runNfeVoidNumber } from "siagrob1/dialogs/NfeVoidNumberAction";
import { NfeReturnRow, prefillNfeReturnRows, hasReturnableBalance, buildNfeReturnPayload } from "siagrob1/helpers/NfeReturnHelpers";
import { TAX_TOTALS_SELECT } from "siagrob1/helpers/InvoiceTaxTotalsHelpers";
import { LINE_CHARGES_SELECT, summarizeInvoiceCharges } from "siagrob1/helpers/InvoiceChargeTotalsHelpers";
import { openDanfeViewer, openNfeCorrectionViewer } from "siagrob1/dialogs/DanfeViewer";
import { openNfeCorrectionDialog } from "siagrob1/dialogs/NfeCorrectionDialog";
import { Button$PressEvent } from "sap/m/Button";
import Control from "sap/ui/core/Control";

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
      // O quadro "Tributos" do documento anterior não pode aparecer enquanto as linhas deste não chegam.
      uiModel.setProperty("/taxTotals", { visible: false, rows: [] });
      uiModel.setProperty("/chargeTotals", summarizeInvoiceCharges([]));

			const sPath = `/SalesInvoices(${id})`;
			// A grade de itens não mostra tributo; sem o $select explícito o autoExpandSelect não os busca e o
			// quadro "Tributos" somaria nada; idem para os quatro valores da seção Totais.
			this.bindElement(sPath, { $expand: `Items($select=${TAX_TOTALS_SELECT},${LINE_CHARGES_SELECT})` });
			this.attachDocumentTotalRefresh();
			void this.refreshTaxLockFromContext();
			void this.refreshNfeHeaderFromContext();
			void this.refreshNfeReturnFromContext();

			return;
		}

	}

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("salesInvoicesEdit", {id: oContext.getProperty("Key") as string });
    }
  }

  async onConfirm() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.error("Contexto inválido.")
      return;
    }

    if (await DialogHelper.confirmDialog("Confirmar documento de saída ?")) {
      this.confirmAction(ctx);
    }
  }

  async onIssueNfe() {
    const ctx = this.getView().getBindingContext() as Context;
    // Documento Normal: já confirmado, a NF-e é transmitida. Devolução própria: emitir é o que confirma.
    const verb = ctx?.getProperty("IsNfeReturn") === true ? "Emitir" : "Transmitir";
    if (!ctx || !(await confirmDialog(`${verb} a NF-e deste documento ?`, `${verb} NF-e ?`))) {
      return;
    }

    await this.runNfeAction(ServerRoutes.salesInvoicesIssueNfe, ctx);
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

  private confirmAction(ctx:Context) {
    const action = (ctx.getModel() as ODataModel).bindContext("/SalesInvoicesConfirm(...)");
    action.setParameter("Key", ctx.getProperty("Key"));

    this.setBusy(false);
    void action.invoke()
      .then(() => {
        MessageToast.show("Documento de saída confirmado com sucesso.");
        this.navToSalesInvoices();
      })
      .finally(() => this.setBusy(false));
  }

  async onReverse() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      MessageBox.error("Contexto inválido.")
      return;
    }

    if (await DialogHelper.confirmDialog("Estornar documento de saída ?")) {
      this.reverseAction(ctx);
    }
  }

  private reverseAction(ctx:Context) {
    const action = (ctx.getModel() as ODataModel).bindContext("/SalesInvoicesReverseConfirm(...)");
    action.setParameter("Key", ctx.getProperty("Key"));

    this.setBusy(false);
    void action.invoke()
      .then(() => {
        MessageToast.show("Documento de saída estornado com sucesso.");
        this.navToSalesInvoices();
      })
      .finally(() => this.setBusy(false));
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
      this.cancelAction(ctx);
    }
  }

  private cancelAction(ctx:Context) {
    const action = (ctx.getModel() as ODataModel).bindContext("/SalesInvoicesCancel(...)");
    action.setParameter("Key", ctx.getProperty("Key"));

    this.setBusy(false);
    void action.invoke()
      .then(() => {
        MessageToast.show("Documento de saída cancelado com sucesso.");
        this.navToSalesInvoices();
      })
      .finally(() => this.setBusy(false));
  }

  private navToSalesInvoices(){
    this.navTo("salesInvoices");
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
