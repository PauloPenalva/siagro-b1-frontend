import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import formatter from "siagrob1/model/formatter";
import CommonController from "siagrob1/controller/common/CommonController";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Dialog from "sap/m/Dialog";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/ui/table/Table";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { Button$PressEvent } from "sap/m/Button";
import { Link$PressEvent } from "sap/m/Link";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { FinancialAdvanceCandidate } from "siagrob1/types/FinancialAdvanceCandidate";
import { Select$ChangeEvent } from "sap/m/Select";
import { FinancialComposition, FinancialCompositionCandidate, FinancialCompositionLine } from "siagrob1/types/FinancialComposition";

export default class Detail extends CommonController {
  formatter = { ...formatter }

  private _composeDialog: Dialog;
  /** Título cujo quadro de composição a tela mostra; descarta resposta atrasada de outro título. */
  private _compositionKey: string;
  /** Trava de duplo clique das ações de composição, dação e compensação. */
  private _actionRunning = false;

  onInit(): void {
    this.getView().setModel(new JSONModel(Detail.emptyComposition()), "composition");
    this.getRouter().getRoute("financialDocumentsDetail")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private static emptyComposition() {
    return {
      lines: [] as FinancialCompositionLine[],
      candidates: [] as FinancialCompositionCandidate[],
      composedInKey: null as string,
      composedInCode: "",
    };
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    (this.getModel("ui") as JSONModel).setProperty("/editable", false);
    this.clearSettlementSelection();

    // $expand explicito: sem ele o $select auto-gerado nao traz as colecoes e as duas
    // tabelas do detalhe nascem vazias.
    this.bindElement(`/FinancialDocuments(${id})`, {
      $expand: "Settlements,ChangeLogs",
    });

    void this.loadComposition(id);
  }

  protected documentContext(): Context | null {
    return this.getView().getBindingContext() as Context;
  }

  protected refreshDocument(): void {
    // SO o element binding. As tabelas de baixas e de log sao bindings RELATIVOS
    // (path 'Settlements' / 'ChangeLogs') sem $$ownRequest, e no UI5 1.141
    // ODataBinding#requestRefresh lanca "Refresh on this binding is not supported"
    // para binding relativo sem $$ownRequest -- de forma SINCRONA, antes da promise
    // existir, entao o .catch() interno nao segura. Chamar refresh() nelas quebrava
    // as quatro operacoes que chamam este metodo (baixa, estorno, vencimento,
    // cancelamento). Refrescar o pai ja basta: refreshInternal cascateia para as
    // bindings dependentes, e o $expand traz as duas colecoes de novo.
    this.getView().getElementBinding()?.refresh();
  }

  /**
   * Quadro de composição (provisório), "composto em" (firme/devolução) e candidatos (compor ou compensar), pela function
   * FinancialDocumentsGetComposition (spec 2026-10-13, títulos firmes).
   */
  private async loadComposition(documentKey: string): Promise<void> {
    this._compositionKey = documentKey;
    const model = this.getModel("composition") as JSONModel;
    model.setData(Detail.emptyComposition());

    const result = await sendJson("GET", `${this.api.financialDocumentsGetComposition}(Key=${documentKey})`);
    // Resposta atrasada de outro título (troca rápida de rota) não pode sobrescrever a tela.
    if (documentKey !== this._compositionKey) return;

    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    const data = odataValue<FinancialComposition>(result.data) ?? { Lines: [], Candidates: [] };
    const lines = data.Lines ?? [];
    const composedIn = lines.find((l) => l.DocumentKey === documentKey);

    model.setData({
      lines,
      candidates: data.Candidates ?? [],
      composedInKey: composedIn?.ProvisionalDocumentKey ?? null,
      composedInCode: composedIn?.ProvisionalCode ?? "",
    });
  }

  /** Executa uma action uma vez só (trava de duplo clique); recarrega o título e o quadro. Recusa aparece na tela. */
  private async runDocumentAction(path: string, payload: object, success: string): Promise<boolean> {
    if (this._actionRunning) return false;
    this._actionRunning = true;
    this.setBusy(true);

    try {
      const result = await sendJson("POST", path, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return false;
      }

      MessageToast.show(success);
      this.refreshDocument();
      await this.loadComposition(this._compositionKey);
      return true;
    } finally {
      this.setBusy(false);
      this._actionRunning = false;
    }
  }

  async onOpenComposeDialog(): Promise<void> {
    const model = this.getModel("composition") as JSONModel;
    const candidates = (model.getProperty("/candidates") as FinancialCompositionCandidate[]) ?? [];

    if (!candidates.length) {
      MessageBox.information("Nenhum título firme ou de devolução com saldo neste contrato.");
      return;
    }

    model.setProperty("/candidates", candidates.map((c) => ({ ...c, selected: false })));

    this._composeDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.ComposeDialog");
    this._composeDialog.open();
  }

  onCloseComposeDialog(): void {
    this._composeDialog?.close();
  }

  async onConfirmCompose(): Promise<void> {
    const candidates = (this.getModel("composition") as JSONModel).getProperty("/candidates") as FinancialCompositionCandidate[];
    // Na ordem da lista: é a ordem em que entram no provisório (regra 10).
    const keys = candidates.filter((c) => c.selected).map((c) => c.DocumentKey);

    if (!keys.length) {
      MessageBox.alert("Selecione ao menos um título firme ou de devolução.");
      return;
    }

    this.onCloseComposeDialog();
    await this.runDocumentAction(this.api.financialDocumentsCompose,
      { Key: this._compositionKey, ComposedKeys: keys }, "Títulos compostos no provisório.");
  }

  async onUncompose(ev: Button$PressEvent): Promise<void> {
    const line = ev.getSource().getBindingContext("composition").getObject() as FinancialCompositionLine;

    if (!(await DialogHelper.confirmDialog(`Desfazer a composição do título ${line.DocumentCode}?`))) return;

    await this.runDocumentAction(this.api.financialDocumentsUncompose,
      { CompositionKey: line.CompositionKey }, "Composição desfeita.");
  }

  onOpenCompositionDocument(ev: Link$PressEvent): void {
    const line = ev.getSource().getBindingContext("composition").getObject() as FinancialCompositionLine;
    this.navTo("financialDocumentsDetail", { id: line.DocumentKey });
  }

  onOpenComposedIn(): void {
    const key = (this.getModel("composition") as JSONModel).getProperty("/composedInKey") as string;
    if (key) {
      this.navTo("financialDocumentsDetail", { id: key });
    }
  }

  private _dationDialog: Dialog;
  private _nettingDialog: Dialog;

  async onOpenDationDialog(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) return;

    (this.getModel("viewModel") as JSONModel).setProperty("/dationDialog", {
      amount: Number(ctx.getProperty("OpenAmount") ?? 0),
      settlementDate: localIsoDate(new Date()),
      notes: "",
    });

    this._dationDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.DationDialog");
    this._dationDialog.open();
  }

  onCloseDationDialog(): void {
    this._dationDialog?.close();
  }

  async onConfirmDation(): Promise<void> {
    const form = (this.getModel("viewModel") as JSONModel).getProperty("/dationDialog") as {
      amount: number; settlementDate: string; notes: string;
    };

    if (!(Number(form.amount) > 0)) {
      MessageBox.alert("O valor da dação deve ser maior que zero.");
      return;
    }

    if (!form.settlementDate) {
      MessageBox.alert("Informe a data da dação.");
      return;
    }

    if (!form.notes?.trim()) {
      MessageBox.alert("Informe o motivo da dação.");
      return;
    }

    this.onCloseDationDialog();
    await this.runDocumentAction(this.api.financialDocumentsDation, {
      Key: this._compositionKey,
      Amount: Number(form.amount),
      // JSON cru (sendJson): DateTimeOffset exige ISO completo; meio-dia UTC não troca o dia no Brasil.
      SettlementDate: `${form.settlementDate}T12:00:00Z`,
      Notes: form.notes,
    }, "Dação registrada.");
  }

  async onOpenNettingDialog(): Promise<void> {
    const candidates = ((this.getModel("composition") as JSONModel)
      .getProperty("/candidates") as FinancialCompositionCandidate[]) ?? [];

    if (!candidates.length) {
      MessageBox.information("Nenhum título firme solto com saldo neste contrato para compensar.");
      return;
    }

    (this.getModel("viewModel") as JSONModel).setProperty("/nettingDialog", {
      counterpartKey: candidates[0].DocumentKey,
    });

    this._nettingDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.NettingDialog");
    this._nettingDialog.open();
  }

  onCloseNettingDialog(): void {
    this._nettingDialog?.close();
  }

  async onConfirmNetting(): Promise<void> {
    const counterpartKey = (this.getModel("viewModel") as JSONModel)
      .getProperty("/nettingDialog/counterpartKey") as string;

    if (!counterpartKey) {
      MessageBox.alert("Selecione o título firme.");
      return;
    }

    this.onCloseNettingDialog();
    await this.runDocumentAction(this.api.financialDocumentsNetting,
      { Key: this._compositionKey, CounterpartKey: counterpartKey }, "Devolução compensada.");
  }

  private _applyAdvanceDialog: Dialog;

  /**
   * "Compensar adiantamento" (spec 2026-10-14): carrega os candidatos ANTES de abrir (o Select precisa dos itens antes
   * do selectedKey) e sugere min(disponível do provisório, crédito do adiantamento), calculado no backend.
   */
  async onOpenApplyAdvanceDialog(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) return;

    const key = this._compositionKey;
    const result = await sendJson("GET", `${this.api.financialDocumentsGetAdvanceCandidates}(Key=${key})`);
    // Resposta atrasada de outro título (troca rápida de rota) não abre diálogo na tela errada.
    if (key !== this._compositionKey) return;

    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    const candidates = odataCollection<FinancialAdvanceCandidate>(result.data);
    if (!candidates.length) {
      MessageBox.information("Nenhum adiantamento com crédito disponível neste contrato.");
      return;
    }

    (this.getModel("viewModel") as JSONModel).setProperty("/applyAdvanceDialog", {
      candidates,
      advanceKey: candidates[0].DocumentKey,
      amount: Number(candidates[0].SuggestedAmount),
      settlementDate: localIsoDate(new Date()),
      availableToSettle: Number(ctx.getProperty("AvailableToSettleAmount") ?? 0),
    });

    this._applyAdvanceDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.ApplyAdvanceDialog");
    this._applyAdvanceDialog.open();
  }

  /** Trocar o adiantamento troca o valor sugerido (lido do item escolhido, não do binding ainda por atualizar). */
  onApplyAdvanceCandidateChange(ev: Select$ChangeEvent): void {
    const advanceKey = ev.getParameter("selectedItem")?.getKey() ?? "";
    const viewModel = this.getModel("viewModel") as JSONModel;
    const candidates = (viewModel.getProperty("/applyAdvanceDialog/candidates") as FinancialAdvanceCandidate[]) ?? [];
    const chosen = candidates.find((c) => c.DocumentKey === advanceKey);

    viewModel.setProperty("/applyAdvanceDialog/advanceKey", advanceKey);
    viewModel.setProperty("/applyAdvanceDialog/amount", chosen ? Number(chosen.SuggestedAmount) : 0);
  }

  onCloseApplyAdvanceDialog(): void {
    this._applyAdvanceDialog?.close();
  }

  async onConfirmApplyAdvance(): Promise<void> {
    const form = (this.getModel("viewModel") as JSONModel).getProperty("/applyAdvanceDialog") as {
      advanceKey: string; amount: number; settlementDate: string;
    };

    if (!form.advanceKey) {
      MessageBox.alert("Selecione o adiantamento.");
      return;
    }

    if (!(Number(form.amount) > 0)) {
      MessageBox.alert("Informe um valor maior que zero.");
      return;
    }

    if (!form.settlementDate) {
      MessageBox.alert("Informe a data da compensação.");
      return;
    }

    this.onCloseApplyAdvanceDialog();
    // Tetos (disponível e crédito) quem decide é o backend: a recusa A5/A6 aparece pelo MessageBox do runDocumentAction.
    await this.runDocumentAction(this.api.financialDocumentsApplyAdvance, {
      Key: this._compositionKey,
      AdvanceKey: form.advanceKey,
      Amount: Number(form.amount),
      SettlementDate: form.settlementDate,
    }, "Adiantamento compensado.");
  }

  /** A lista de origem foi guardada pelo FinancialDocumentsBaseController ao navegar para ca. */
  onBack(): void {
    const origin = (this.getModel("viewModel") as JSONModel)
      .getProperty("/financialDocumentOriginRoute") as string;

    this.navTo(origin || "accountsPayable");
  }

  /** Documento de entrada do firme (spec 2026-10-13): a NF que deu o preço. */
  onOpenPurchaseInvoice(): void {
    const key = this.documentContext()?.getProperty("PurchaseInvoiceKey") as string;
    if (key) {
      this.navTo("purchaseInvoicesDetail", { id: key });
    }
  }

  async openFinancialAccountsValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
    await this.applyValueHelp(ev, "FinancialAccountsSelectDialog", ["Code", "Name"], "Code",
      [ new Filter("Inactive", FilterOperator.EQ, false) ]);
  }

  private _settleDialog: Dialog;

  async onSettle(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) {
      MessageBox.error("Título não carregado.");
      return;
    }

    if (ctx.getProperty("IsBlockedForSettlement")) {
      MessageBox.warning(ctx.getProperty("Nature") === "Provisional"
        ? "Nada disponível para baixa: componha títulos firmes no provisório antes."
        : "Título firme não recebe baixa direta: componha no provisório ou baixe por dação.");
      return;
    }

    // Provisório baixa só o composto (spec 2026-10-13); nas demais naturezas o disponível é o saldo em aberto.
    const openAmount = Number(ctx.getProperty("AvailableToSettleAmount") ?? ctx.getProperty("OpenAmount") ?? 0);

    if (openAmount <= 0) {
      MessageBox.warning("O título não tem saldo disponível para baixa.");
      return;
    }

    (this.getModel("viewModel") as JSONModel).setProperty("/settleDialog", {
      financialAccountCode: "",
      settlementDate: localIsoDate(new Date()),
      amount: openAmount,
      interestAmount: 0,
      fineAmount: 0,
      discountAmount: 0,
      documentReference: "",
      notes: "",
    });

    this._settleDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.SettleDialog");
    this._settleDialog.open();
  }

  onCloseSettleDialog(): void {
    this._settleDialog?.close();
  }

  async onConfirmSettle(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) return;

    const viewModel = this.getModel("viewModel") as JSONModel;
    const form = viewModel.getProperty("/settleDialog") as {
      financialAccountCode: string; settlementDate: string; amount: number;
      interestAmount: number; fineAmount: number; discountAmount: number;
      documentReference: string; notes: string;
    };

    if (!form.financialAccountCode) {
      MessageBox.alert("Informe a conta financeira da baixa.");
      return;
    }

    if (!form.settlementDate) {
      MessageBox.alert("Informe a data da baixa.");
      return;
    }

    if (!(Number(form.amount) > 0)) {
      MessageBox.alert("O valor da baixa deve ser maior que zero.");
      return;
    }

    const amount = Number(form.amount);
    const openAmount = Number(ctx.getProperty("AvailableToSettleAmount") ?? ctx.getProperty("OpenAmount") ?? 0);

    if (amount > openAmount) {
      MessageBox.warning(
        `O valor da baixa (${formatter.formatDecimal(amount, 2)}) excede o disponível para baixa ` +
        `(${formatter.formatDecimal(openAmount, 2)}).`);
      return;
    }

    this.onCloseSettleDialog();

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel).bindContext(this.api.financialDocumentsSettle);
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("FinancialAccountCode", form.financialAccountCode);
      action.setParameter("Amount", Number(form.amount));
      action.setParameter("SettlementDate", form.settlementDate);
      action.setParameter("InterestAmount", Number(form.interestAmount ?? 0));
      action.setParameter("FineAmount", Number(form.fineAmount ?? 0));
      action.setParameter("DiscountAmount", Number(form.discountAmount ?? 0));
      action.setParameter("DocumentReference", form.documentReference ?? "");
      action.setParameter("Notes", form.notes ?? "");
      await action.invoke();

      MessageToast.show("Baixa registrada.");
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao registrar a baixa.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Origem da baixa selecionada: o "Estornar baixa" some para abatimento de composição (InvoiceOffset, que se desfaz
   * pela composição), estorno e devolução de adiantamento, que o backend recusa.
   */
  onSettlementSelectionChange(): void {
    const oTable = this.byId("financialSettlementsTable") as Table;
    const i = oTable.getSelectedIndex();
    const ctx = i < 0 ? null : oTable.getContextByIndex(i) as Context;
    (this.getModel("viewModel") as JSONModel).setProperty("/financialSettlementSelectedOrigin",
      ctx ? String(ctx.getProperty("Origin") ?? "") : "");
  }

  /** Limpa a seleção da grade de baixas (troca de título, estorno feito) e com ela a origem guardada. */
  private clearSettlementSelection(): void {
    (this.byId("financialSettlementsTable") as Table | undefined)?.clearSelection();
    (this.getModel("viewModel") as JSONModel).setProperty("/financialSettlementSelectedOrigin", "");
  }

  async onReverseSettlement(): Promise<void> {
    const oTable = this.byId("financialSettlementsTable") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione a baixa a estornar.");
      return;
    }

    const settlement = oTable.getContextByIndex(i) as Context;

    const reason = await DialogHelper.promptDialog(
      "Estornar baixa", "Informe o motivo do estorno:");
    if (!reason) return;

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel)
        .bindContext(this.api.financialDocumentsReverseSettlement);
      action.setParameter("SettlementKey", settlement.getProperty("Key"));
      action.setParameter("Reason", reason);
      await action.invoke();

      MessageToast.show("Baixa estornada.");
      this.clearSettlementSelection();
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao estornar a baixa.");
    } finally {
      this.setBusy(false);
    }
  }

  private _dueDateDialog: Dialog;

  async onSetDueDate(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) {
      MessageBox.error("Título não carregado.");
      return;
    }

    const current = ctx.getProperty("DueDate") as string;

    (this.getModel("viewModel") as JSONModel).setProperty("/dueDateDialog", {
      dueDate: current ? String(current).substring(0, 10) : "",
    });

    this._dueDateDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.SetDueDateDialog");
    this._dueDateDialog.open();
  }

  onCloseSetDueDateDialog(): void {
    this._dueDateDialog?.close();
  }

  async onConfirmSetDueDate(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) return;

    const dueDate = (this.getModel("viewModel") as JSONModel)
      .getProperty("/dueDateDialog/dueDate") as string;

    if (!dueDate) {
      MessageBox.alert("Informe o novo vencimento.");
      return;
    }

    this.onCloseSetDueDateDialog();

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel).bindContext(this.api.financialDocumentsSetDueDate);
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("DueDate", dueDate);
      await action.invoke();

      MessageToast.show("Vencimento alterado.");
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao alterar o vencimento.");
    } finally {
      this.setBusy(false);
    }
  }

  async onCancelDocument(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) {
      MessageBox.error("Título não carregado.");
      return;
    }

    const reason = await DialogHelper.promptDialog(
      "Cancelar título", "Informe o motivo do cancelamento:");
    if (!reason) return;

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel).bindContext(this.api.financialDocumentsCancel);
      action.setParameter("Key", ctx.getProperty("Key"));
      action.setParameter("Reason", reason);
      await action.invoke();

      MessageToast.show("Título cancelado.");
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao cancelar o título.");
    } finally {
      this.setBusy(false);
    }
  }

  private _refundDialog: Dialog;

  /**
   * Conta financeira sugerida: a da baixa mais recente do título. É quase sempre a conta de onde
   * o dinheiro saiu, então poupa um value help no caso comum sem impedir a troca.
   *
   * NÃO usar `getCurrentContexts()` aqui: por contrato do próprio framework ele devolve só os
   * contextos "como foram pedidos pela última vez pelo controle" — e a tabela é
   * `visibleRowCountMode="Fixed"` com `visibleRowCount="6"`, ordenada por `SettlementDate`
   * ASCENDENTE (mais antiga primeiro). Num título com mais de 6 baixas, o "último" contexto
   * RENDERIZADO seria uma baixa antiga, não a mais recente — sugestão de conta errada, em
   * silêncio, dentro de um fluxo de devolução de dinheiro. `requestContexts(0, Infinity)` busca a
   * coleção inteira e permite escolher pela data de verdade, não pela janela visível.
   *
   * Cai para "" (mesmo comportamento inicial do SettleDialog) quando a tabela, o binding ou
   * qualquer baixa com conta preenchida não existir — inclusive se a seção "Baixas" ainda não
   * tiver sido instanciada (ObjectPageSection tardia) ou a requisição falhar.
   */
  private async lastSettlementAccount(): Promise<string> {
    try {
      const table = this.byId("financialSettlementsTable") as Table;
      const binding = table?.getBinding("rows") as ODataListBinding | undefined;
      if (!binding) return "";

      const contexts = await binding.requestContexts(0, Infinity);

      let latestCode = "";
      let latestTime = -Infinity;

      for (const context of contexts) {
        const code = context.getProperty("FinancialAccountCode") as string;
        if (!code) continue;

        const time = new Date(context.getProperty("SettlementDate") as string).getTime();
        if (time >= latestTime) {
          latestTime = time;
          latestCode = code;
        }
      }

      return latestCode;
    } catch {
      return "";
    }
  }

  async onRefundAdvance(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) {
      MessageBox.error("Título não carregado.");
      return;
    }

    const settled = Number(ctx.getProperty("SettledAmount") ?? 0);

    if (!(settled > 0)) {
      MessageBox.warning("O adiantamento não tem valor pago: não há o que devolver.");
      return;
    }

    (this.getModel("viewModel") as JSONModel).setProperty("/refundDialog", {
      financialAccountCode: await this.lastSettlementAccount(),
      refundDate: localIsoDate(new Date()),
      amountText: formatter.formatDecimal(settled, 2),
      documentReference: "",
      reason: "",
    });

    this._refundDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.RefundAdvanceDialog");
    this._refundDialog.open();
  }

  onCloseRefundDialog(): void {
    this._refundDialog?.close();
  }

  async onConfirmRefund(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) return;

    const form = (this.getModel("viewModel") as JSONModel)
      .getProperty("/refundDialog") as {
        financialAccountCode: string; refundDate: string;
        documentReference: string; reason: string;
      };

    if (!form.financialAccountCode) {
      MessageBox.alert("Informe a conta financeira que recebeu a devolução.");
      return;
    }

    if (!form.refundDate) {
      MessageBox.alert("Informe a data da devolução.");
      return;
    }

    if (!form.reason?.trim()) {
      MessageBox.alert("Informe o motivo da devolução.");
      return;
    }

    this.onCloseRefundDialog();

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel).bindContext(this.api.financialAdvancesRefund);
      action.setParameter("DocumentKey", ctx.getProperty("Key"));
      action.setParameter("FinancialAccountCode", form.financialAccountCode);
      action.setParameter("RefundDate", form.refundDate);
      action.setParameter("DocumentReference", form.documentReference ?? "");
      action.setParameter("Reason", form.reason);
      await action.invoke();

      MessageToast.show("Devolução registrada. O título foi cancelado.");
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao registrar a devolução.");
    } finally {
      this.setBusy(false);
    }
  }

  private _relinkDialog: Dialog;

  async onRelinkContract(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) {
      MessageBox.error("Título não carregado.");
      return;
    }

    (this.getModel("viewModel") as JSONModel).setProperty("/relinkDialog", {
      currentContractCode: (ctx.getProperty("OriginDocNumber") as string) || "(sem contrato)",
      contractCode: "",
      contractKey: null,
    });

    this._relinkDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialDocuments.fragments.RelinkContractDialog");
    this._relinkDialog.open();
  }

  onCloseRelinkDialog(): void {
    this._relinkDialog?.close();
  }

  /**
   * Value help do contrato de destino.
   *
   * O diálogo é escolhido pela DIREÇÃO do título, não por um campo de tela: a pagar migra para
   * contrato de compra, a receber para contrato de venda, e a action recusa o cruzado.
   *
   * O filtro de parceiro vai como defaultFilters porque muda a cada abertura. CardCode é STRING,
   * então Filter é seguro aqui; o status Approved continua no $filter estático de cada
   * fragmento, porque filtro de enum montado como objeto estoura "Unsupported type" no UI5.
   */
  async openRelinkContractValueHelp(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) return;

    const isPayable = ctx.getProperty("Direction") === "Payable";
    const dialogName = isPayable
      ? "PurchaseContractsApprovedSelectDialog"
      : "SalesContractsSelectDialog";

    const cardCode = ctx.getProperty("CardCode") as string;

    const oSelected = await DialogHelper.openTableSelectDialog(
      this, dialogName, ["Code", "CardName"],
      [new Filter("CardCode", FilterOperator.EQ, cardCode)]);

    if (!oSelected) return;

    const viewModel = this.getModel("viewModel") as JSONModel;
    viewModel.setProperty("/relinkDialog/contractCode", oSelected.getProperty("Code") as string);
    viewModel.setProperty("/relinkDialog/contractKey", oSelected.getProperty("Key") as string);
  }

  async onConfirmRelink(): Promise<void> {
    const ctx = this.documentContext();
    if (!ctx) return;

    const form = (this.getModel("viewModel") as JSONModel)
      .getProperty("/relinkDialog") as { contractCode: string; contractKey: string };

    if (!form.contractKey) {
      MessageBox.alert("Selecione o contrato de destino.");
      return;
    }

    this.onCloseRelinkDialog();

    try {
      this.setBusy(true);
      const action = (this.getModel() as ODataModel)
        .bindContext(this.api.financialAdvancesRelinkContract);
      action.setParameter("DocumentKey", ctx.getProperty("Key"));
      action.setParameter("ContractType",
        ctx.getProperty("Direction") === "Payable" ? "Purchase" : "Sales");
      action.setParameter("ContractKey", form.contractKey);
      await action.invoke();

      MessageToast.show(`Adiantamento vinculado ao contrato ${form.contractCode}.`);
      this.refreshDocument();
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao vincular o adiantamento.");
    } finally {
      this.setBusy(false);
    }
  }

}
