import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
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
import formatter from "siagrob1/model/formatter";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { sendJson, odataValue, readErrorMessage } from "siagrob1/helpers/FetchHelpers";
import { nfeOutcomeMessage, NfeOutcome } from "siagrob1/helpers/NfeHelpers";
import { ReturnableRow, prefillNfeReturnRows, hasReturnableBalance, buildNfeReturnPayload } from "siagrob1/helpers/NfeReturnHelpers";
import {
  PURCHASE_ITEM_SELECT, PurchaseNfeState, canIssuePurchaseNfe, canReturnPurchase,
} from "siagrob1/helpers/PurchaseInvoiceNfeHelpers";
import { BaseController } from "./BaseController";

/** Linha do "Devolver" da entrada: o comprado no lugar do vendido. */
type PurchaseReturnRow = ReturnableRow & { ItemName: string; PurchasedQuantity: number; ReturnedQuantity: number };

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
    uiModel.setProperty("/canIssueNfe", false);
    uiModel.setProperty("/canReturn", false);

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
        `Items($select=${PURCHASE_ITEM_SELECT};` +
        "$expand=SalesInvoiceItem($expand=SalesInvoice),PurchaseContract($select=Key,Code))",
    });

    // Depois que os dados CHEGAM, não junto do bindElement: o bind é assíncrono e somar aqui
    // percorreria uma lista ainda vazia, deixando "Total dos itens" parado em 0,00 para sempre.
    this.getView().getElementBinding()
      ?.attachEventOnce("dataReceived", () => this.refreshDocumentTotal());

    void this.refreshDetailNfe();
  }

  /**
   * Modo NF-e e os dois botões que dependem do estado do documento (regras puras em PurchaseInvoiceNfeHelpers).
   * `reset = false` depois de uma ação no mesmo documento: a seção e os botões não piscam.
   */
  private async refreshDetailNfe(reset = true) {
    const oContext = this.getView().getBindingContext() as Context;
    await this.refreshNfeMode(reset);
    const uiModel = this.getModel("ui") as JSONModel;
    const state = oContext ? await oContext.requestObject() as PurchaseNfeState : undefined;

    // Outro documento foi aberto enquanto esperava: quem vale é a chamada dele.
    if (this.getView().getBindingContext() !== oContext) {
      return;
    }

    const nfeMode = uiModel.getProperty("/nfeMode") === true;

    uiModel.setProperty("/canIssueNfe", !!state && canIssuePurchaseNfe(state, nfeMode));
    uiModel.setProperty("/canReturn", !!state && canReturnPurchase(state, nfeMode));
  }

  async onIssueNfe() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx || !(await confirmDialog("Emitir a NF-e deste documento ?", "Emitir NF-e ?"))) {
      return;
    }

    await this.runNfeAction(ServerRoutes.purchaseInvoicesIssueNfe, ctx);
  }

  async onConsultNfe() {
    const ctx = this.getView().getBindingContext() as Context;
    if (ctx) {
      await this.runNfeAction(ServerRoutes.purchaseInvoicesConsultNfe, ctx);
    }
  }

  async onCompleteNfeConfirmation() {
    const ctx = this.getView().getBindingContext() as Context;
    if (ctx) {
      await this.runNfeAction(ServerRoutes.purchaseInvoicesCompleteNfeConfirmation, ctx);
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
      void this.refreshDetailNfe(false);
      this.setBusy(false);
    }
  }

  async onDanfe() {
    const ctx = this.getView().getBindingContext() as Context;

    this.setBusy(true);
    try {
      const response = await fetch(`${ServerRoutes.purchaseInvoicesDanfeReport}/${ctx.getProperty("Key") as string}/print`, { method: "POST" });

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
      const response = await fetch(`${ServerRoutes.purchaseInvoicesNfeXml}(Key=${ctx.getProperty("Key") as string})`);

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

  /** "Devolver": abre o diálogo com os itens da entrada e o saldo devolvível de cada um. */
  async onNfeReturn() {
    const ctx = this.getView().getBindingContext() as Context;
    if (!ctx) {
      return;
    }

    let rows: PurchaseReturnRow[] = [];
    this.setBusy(true);
    try {
      const result = await sendJson(
        "GET", `${ServerRoutes.purchaseInvoicesNfeReturnableItems}(Key=${ctx.getProperty("Key") as string})`);

      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      rows = odataValue<PurchaseReturnRow[]>(result.data) ?? [];
    } finally {
      this.setBusy(false);
    }

    if (!hasReturnableBalance(rows)) {
      MessageBox.information("Esta entrada não tem saldo a devolver.");
      return;
    }

    this.getView().setModel(new JSONModel({ rows: prefillNfeReturnRows(rows), reason: "", busy: false }), "nfeReturn");

    this._nfeReturnDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.purchaseInvoices.fragments.NfeReturnDialog");
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
      model.getProperty("/rows") as PurchaseReturnRow[], model.getProperty("/reason") as string);

    if (built.ok === false) {
      MessageBox.warning(built.message);
      return;
    }

    model.setProperty("/busy", true);
    try {
      const action = (ctx.getModel() as ODataModel).bindContext(ServerRoutes.purchaseInvoicesCreateNfeReturn);
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("OriginItemKeys", built.payload.OriginItemKeys);
      action.setParameter("Quantities", built.payload.Quantities);
      action.setParameter("Reason", built.payload.Reason);
      await action.invoke();

      const key = action.getBoundContext().getProperty("value") as string;
      this._nfeReturnDialog.close();
      MessageToast.show("Devolução criada. Confira os dados e emita a NF-e.", { closeOnBrowserNavigation: false });
      this.navTo("purchaseInvoicesDetail", { id: key });
    } catch {
      // O handler global de mensagens do OData (Component) já mostrou o erro do servidor.
    } finally {
      model.setProperty("/busy", false);
    }
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

    // Vai direto para a edição: quem estorna quer alterar o documento, e o estorno é justamente o
    // que o destrava (só documento pendente é alterável).
    await this.invokeAction(
      "/PurchaseInvoicesReverseConfirm(...)", ctx, "Confirmação estornada.",
      () => this.onEdit());
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
  /**
   * `onSuccess` existe porque o destino depois da ação NÃO é o mesmo para todas: confirmar e
   * cancelar encerram o trabalho no documento e voltam à lista, mas estornar existe justamente
   * para alterar algo — e largar o operador na lista o obrigaria a procurar de novo o documento
   * que ele acabou de destravar. Sem parâmetro, mantém o comportamento antigo.
   */
  private async invokeAction(
    path: string, ctx: Context, message: string, onSuccess?: () => void) {
    const action = (ctx.getModel() as ODataModel).bindContext(path);
    action.setParameter("Key", ctx.getProperty("Key"));

    try {
      this.setBusy(true);
      await action.invoke();

      MessageToast.show(message);

      if (onSuccess) {
        onSuccess();
        return;
      }

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
