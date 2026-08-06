import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import Dialog from "sap/m/Dialog";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/**
 * Visualização do documento de entrada, com o ciclo de vida (confirmar, estornar, cancelar) e os
 * comentários.
 *
 * @namespace siagrob1.controller.purchaseInvoices
 */
export default class Detail extends BaseController {
  formatter = { ...formatter }

  onInit(): void {
    this.getRouter().getRoute("purchaseInvoicesDetail")
      .attachPatternMatched((ev) => this.detailRouteMatched(ev));
  }

  private detailRouteMatched(ev: Route$MatchedEvent) {
    const { id } = ev.getParameter("arguments") as { id: string };

    if (id == null) {
      return;
    }

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", false);
    uiModel.setProperty("/typeEditable", false);

    // $expand explícito: sem carregar SalesInvoiceItem a Quebra Apurada volta ZERO em silêncio e
    // toda linha de devolução parece divergente.
    //
    // O $select das linhas também é explícito, e AssessedShortage/Difference são o motivo. Suas
    // colunas só ficam visíveis quando o tipo é Devolução — informação que vem do CABEÇALHO e
    // ainda não chegou quando o UI5 monta o $select automático. Ficando de fora, ele vai buscar
    // cada uma depois por `Items({key})/AssessedShortage`, rota que o backend não expõe: 404 na
    // cara do usuário e as duas colunas em branco.
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

  onBack() {
    this.navTo("purchaseInvoices");
  }

  onEdit() {
    const oContext = this.getView().getBindingContext() as Context;

    if (oContext) {
      this.navTo("purchaseInvoicesEdit", { id: oContext.getProperty("Key") as string });
    }
  }

  async onConfirm() {
    const ctx = this.getView().getBindingContext() as Context;

    if (!ctx) {
      MessageBox.error("Documento não carregado.");
      return;
    }

    if (!await confirmDialog("Confirmar este documento de entrada ?", "Confirmar documento")) {
      return;
    }

    await this.invokeAction("/PurchaseInvoicesConfirm(...)", ctx, "Documento confirmado.");
  }

  async onReverseConfirm() {
    const ctx = this.getView().getBindingContext() as Context;

    if (!ctx) {
      return;
    }

    if (!await confirmDialog(
      "Estornar a confirmação ? O documento volta a pendente e pode ser alterado.",
      "Estornar confirmação")) {
      return;
    }

    await this.invokeAction("/PurchaseInvoicesReverseConfirm(...)", ctx, "Confirmação estornada.");
  }

  async onCancelInvoice() {
    const ctx = this.getView().getBindingContext() as Context;

    if (!ctx) {
      return;
    }

    if (!await confirmDialog(
      "Cancelar este documento ? A chave da NF-e volta a ficar livre.",
      "Cancelar documento")) {
      return;
    }

    await this.invokeAction("/PurchaseInvoicesCancel(...)", ctx, "Documento cancelado.");
  }

  /**
   * Actions do ciclo de vida vão por `bindContext`, não por `callFunction`: é a forma do OData v4
   * no UI5.
   */
  private async invokeAction(path: string, ctx: Context, message: string) {
    const action = (ctx.getModel() as ODataModel).bindContext(path);
    action.setParameter("Key", ctx.getProperty("Key"));

    try {
      this.setBusy(true);
      await action.invoke();

      MessageToast.show(message);
      this.navTo("purchaseInvoices");
    } finally {
      this.setBusy(false);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Comentários                                                         */
  /* ------------------------------------------------------------------ */

  private _commentDialog: Dialog;

  private selectedCommentContext(): Context | null {
    const oTable = this.byId("purchaseInvoiceCommentsTable") as Table;
    const selected = oTable.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione um comentário.");
      return null;
    }

    return oTable.getContextByIndex(selected) as Context;
  }

  /**
   * Autor ou admin. A permissão é decidida no SERVIDOR; isto só evita a viagem inútil.
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
      "siagrob1.view.purchaseInvoices.fragments.PurchaseInvoiceCommentDialog"
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
        const action = oModel.bindContext(this.api.purchaseInvoicesCommentUpdate);
        action.setParameter("Key", commentKey);
        action.setParameter("Text", text);
        await action.invoke();
        MessageToast.show("Comentário alterado.");
      } else {
        const action = oModel.bindContext(this.api.purchaseInvoicesCommentCreate);
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

    if (!await confirmDialog("Excluir o comentário selecionado ?", "Excluir Comentário")) {
      return;
    }

    this.setBusy(true);

    try {
      const oModel = this.getView().getModel() as ODataModel;
      const action = oModel.bindContext(this.api.purchaseInvoicesCommentDelete);
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
   * Recarrega a tabela de comentários (cache próprio, por `$$ownRequest`) e o log de alterações:
   * toda mutação de comentário grava linha no log.
   */
  private refreshCommentsList() {
    ((this.byId("purchaseInvoiceCommentsTable") as Table)
      ?.getBinding("rows") as ODataListBinding)?.refresh();

    ((this.byId("purchaseInvoiceChangeLogsTable") as Table)
      ?.getBinding("rows") as ODataListBinding)?.refresh();
  }
}
