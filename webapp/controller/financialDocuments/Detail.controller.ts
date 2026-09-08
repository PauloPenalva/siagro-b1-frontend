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

export default class Detail extends CommonController {
  formatter = { ...formatter }

  onInit(): void {
    this.getRouter().getRoute("financialDocumentsDetail")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    (this.getModel("ui") as JSONModel).setProperty("/editable", false);

    // $expand explicito: sem ele o $select auto-gerado nao traz as colecoes e as duas
    // tabelas do detalhe nascem vazias.
    this.bindElement(`/FinancialDocuments(${id})`, {
      $expand: "Settlements,ChangeLogs",
    });
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

  /** A lista de origem foi guardada pelo FinancialDocumentsBaseController ao navegar para ca. */
  onBack(): void {
    const origin = (this.getModel("viewModel") as JSONModel)
      .getProperty("/financialDocumentOriginRoute") as string;

    this.navTo(origin || "accountsPayable");
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
      MessageBox.warning(
        "Título provisório não pode ser baixado. Ele será liberado quando o documento fiscal for confirmado.");
      return;
    }

    const openAmount = Number(ctx.getProperty("OpenAmount") ?? 0);

    if (openAmount <= 0) {
      MessageBox.warning("O título não tem saldo em aberto.");
      return;
    }

    (this.getModel("viewModel") as JSONModel).setProperty("/settleDialog", {
      financialAccountCode: "",
      settlementDate: new Date().toISOString().substring(0, 10),
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
    const openAmount = Number(ctx.getProperty("OpenAmount") ?? 0);

    if (amount > openAmount) {
      MessageBox.warning(
        `O valor da baixa (${formatter.formatDecimal(amount, 2)}) excede o saldo em aberto ` +
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

}
