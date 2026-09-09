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
      refundDate: new Date().toISOString().substring(0, 10),
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
