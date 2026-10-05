import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Dialog from "sap/m/Dialog";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { sendJson, odataValue, readErrorMessage } from "siagrob1/helpers/FetchHelpers";
import { nfeOutcomeMessage, NfeOutcome } from "siagrob1/helpers/NfeHelpers";
import { NfeReturnRow, prefillNfeReturnRows, hasReturnableBalance, buildNfeReturnPayload } from "siagrob1/helpers/NfeReturnHelpers";

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

			const sPath = `/SalesInvoices(${id})`;
			this.bindElement(sPath);
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
    if (!ctx || !(await confirmDialog("Emitir a NF-e deste documento ?", "Emitir NF-e ?"))) {
      return;
    }

    await this.runNfeAction(ServerRoutes.salesInvoicesIssueNfe, ctx);
  }

  async onConsultNfe() {
    const ctx = this.getView().getBindingContext() as Context;
    if (ctx) {
      await this.runNfeAction(ServerRoutes.salesInvoicesConsultNfe, ctx);
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
  private async runNfeAction(url: string, ctx: Context) {
    this.setBusy(true);
    try {
      const result = await sendJson("POST", url, { Key: ctx.getProperty("Key") as string });

      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      const message = nfeOutcomeMessage(odataValue<NfeOutcome>(result.data));
      if (message.type === "success") {
        MessageToast.show(message.text);
      } else if (message.type === "warning") {
        MessageBox.warning(message.text);
      } else {
        MessageBox.error(message.text);
      }
    } finally {
      try {
        await ctx.requestRefresh();
      } catch {
        // a releitura falhar não pode deixar a tela ocupada
      }
      this.setBusy(false);
    }
  }

  async onDanfe() {
    const ctx = this.getView().getBindingContext() as Context;

    this.setBusy(true);
    try {
      const response = await fetch(`${ServerRoutes.danfeReport}/${ctx.getProperty("Key") as string}/print`, { method: "POST" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response) || "Falha ao gerar o DANFE.");
      }

      const fileURL = URL.createObjectURL(await response.blob());
      window.open(fileURL, "_blank");
      setTimeout(() => URL.revokeObjectURL(fileURL), 60000);
    } catch (error) {
      MessageBox.error((error as Error)?.message || "Falha ao gerar o DANFE.");
    } finally {
      this.setBusy(false);
    }
  }

  async onNfeXml() {
    const ctx = this.getView().getBindingContext() as Context;

    this.setBusy(true);
    try {
      const response = await fetch(`${ServerRoutes.salesInvoicesNfeXml}(Key=${ctx.getProperty("Key") as string})`);

      if (!response.ok) {
        throw new Error(await readErrorMessage(response) || "Falha ao baixar o XML.");
      }

      const link = document.createElement("a");
      link.href = URL.createObjectURL(await response.blob());
      link.download = `${ctx.getProperty("ChaveNFe") as string}-procNFe.xml`;
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
