import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/m/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * Fila da diretoria: fixações de preço aguardando aprovação, de todos os contratos de
 * VENDA a fixar (PAF). Espelha controller/purchaseContracts/priceFixationApproval/Main.
 *
 * @namespace siagrob1.controller.salesContracts.priceFixationApproval
 */
export default class Main extends CommonController {

  private _priceFixationApprovalDialog: Dialog;
  private _priceFixationDetailsDialog: Dialog;

  onInit(): void {
    this.getRouter().getRoute("salesContractsPriceFixationApproval")
      .attachPatternMatched(() => this.onRefresh());
  }

  onRefresh(): void {
    const table = this.byId("priceFixationApprovalTable") as Table;
    (table.getBinding("items") as ODataListBinding)?.refresh();
  }

  onApprove(): void {
    void this.openActionDialog("Approve");
  }

  onReject(): void {
    void this.openActionDialog("Reject");
  }

  /**
   * Diálogo somente-leitura com todos os dados da fixação selecionada — inclusive
   * vencimento financeiro e dados para pagamento. Reusa o fragmento da tela de contrato.
   */
  async onViewFixationDetails(): Promise<void> {
    const table = this.byId("priceFixationApprovalTable") as Table;
    const item = table.getSelectedItem();

    if (!item) {
      MessageBox.alert("Selecione uma fixação para ver os detalhes.");
      return;
    }

    this._priceFixationDetailsDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.salesContracts.fragments.PriceFixationDetailsDialog"
    );

    this._priceFixationDetailsDialog.setBindingContext(item.getBindingContext());
    this._priceFixationDetailsDialog.open();
  }

  onClosePriceFixationDetailsDialog(): void {
    this._priceFixationDetailsDialog?.close();
  }

  onViewContract(): void {
    const table = this.byId("priceFixationApprovalTable") as Table;
    const item = table.getSelectedItem();

    if (!item) {
      MessageBox.alert("Selecione uma fixação para ver o contrato.");
      return;
    }

    const contractKey = item.getBindingContext().getProperty("SalesContract/Key") as string;

    if (!contractKey) {
      MessageBox.error("Contrato da fixação não encontrado.");
      return;
    }

    this.navTo("salesContractsDetail", { id: contractKey, "?query": { readonly: "true" } });
  }

  onClosePriceFixationApprovalDialog(): void {
    this._priceFixationApprovalDialog?.close();
  }

  async onConfirmPriceFixationAction(): Promise<void> {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const action = viewModel.getProperty("/dialogAction") as string;
    const key = viewModel.getProperty("/dialogFixationKey") as string;
    const comments = (viewModel.getProperty("/dialogComments") as string) ?? "";

    if (action === "Reject" && comments.trim().length === 0) {
      MessageBox.error("Informe o motivo da rejeição.");
      return;
    }

    const isApprove = action === "Approve";
    const route = isApprove
      ? this.api.salesContractsPriceFixationApproval
      : this.api.salesContractsPriceFixationReject;

    this.onClosePriceFixationApprovalDialog();
    this.setBusy(true);

    // bindContext + invoke: a action roda pelo ODataModel. Aprovar/rejeitar tira a
    // fixação da fila (deixa de ser InApproval), então recarregamos a lista.
    const oModel = this.getView().getModel() as ODataModel;
    const boundAction = oModel.bindContext(route);
    boundAction.setParameter("Key", key);
    boundAction.setParameter("Comments", comments);

    try {
      await boundAction.invoke();
      MessageToast.show(isApprove ? "Fixação aprovada." : "Fixação rejeitada.");
      this.onRefresh();
    } catch (err) {
      MessageBox.error(
        (err as Error).message ??
        (isApprove ? "Erro ao aprovar fixação." : "Erro ao rejeitar fixação.")
      );
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Monta o resumo do que está sendo decidido. A diretoria aprova um valor financeiro,
   * então volume e preço isolados não bastam — mostra o total.
   */
  private async openActionDialog(action: "Approve" | "Reject"): Promise<void> {
    const table = this.byId("priceFixationApprovalTable") as Table;
    const item = table.getSelectedItem();

    if (!item) {
      MessageBox.alert("Selecione uma fixação.");
      return;
    }

    const ctx = item.getBindingContext() as Context;

    // getProperty devolve Edm.Decimal como STRING; sem Number() a multiplicação e o
    // toLocaleString não funcionam.
    const volume = Number(ctx.getProperty("FixationVolume") ?? 0);
    const price = Number(ctx.getProperty("FixationPrice") ?? 0);
    const code = (ctx.getProperty("SalesContract/Code") as string) ?? "";

    const fmt = (n: number, decimals: number) =>
      n.toLocaleString("pt-BR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

    const total = fmt(volume * price, 2);

    const viewModel = this.getModel("viewModel") as JSONModel;
    const isApprove = action === "Approve";

    viewModel.setProperty("/dialogAction", action);
    viewModel.setProperty("/dialogFixationKey", ctx.getProperty("Key") as string);
    viewModel.setProperty("/dialogComments", "");
    viewModel.setProperty("/dialogTitle", isApprove ? "Aprovar Fixação?" : "Rejeitar Fixação?");
    viewModel.setProperty("/dialogConfirmButtonText", isApprove ? "Aprovar" : "Rejeitar");
    viewModel.setProperty(
      "/dialogSummary",
      `Contrato ${code}: ${fmt(volume, 3)} kg × R$ ${fmt(price, 8)} = R$ ${total}`
    );

    this._priceFixationApprovalDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.salesContracts.priceFixationApproval.fragments.PriceFixationApprovalDialog"
    );

    this._priceFixationApprovalDialog?.open();
  }
}
