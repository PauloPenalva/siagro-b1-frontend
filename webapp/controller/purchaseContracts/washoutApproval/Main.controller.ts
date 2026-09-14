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
import { formatNumberPtBr } from "siagrob1/helpers/WashoutHelpers";

type WashoutDecision = "Approve" | "Reject";

type WashoutDecisionState = {
  action: WashoutDecision;
  key: string;
  title: string;
  summary: string;
  comments: string;
  placeholder: string;
  confirmText: string;
};

/**
 * Fila de washouts em aprovação, de todos os contratos de compra. Espelha
 * purchaseContracts/priceFixationApproval.
 *
 * @namespace siagrob1.controller.purchaseContracts.washoutApproval
 */
export default class Main extends CommonController {

  private _decisionDialog: Dialog;

  onInit(): void {
    this.getRouter().getRoute("purchaseContractsWashoutApproval")
      .attachPatternMatched(() => this.onRefresh());
  }

  onRefresh(): void {
    const table = this.byId("washoutApprovalTable") as Table;
    (table.getBinding("items") as ODataListBinding)?.refresh();
  }

  onApprove(): void {
    void this.openDecisionDialog("Approve");
  }

  onReject(): void {
    void this.openDecisionDialog("Reject");
  }

  onViewContract(): void {
    const item = (this.byId("washoutApprovalTable") as Table).getSelectedItem();

    if (!item) {
      MessageBox.alert("Selecione um washout para ver o contrato.");
      return;
    }

    const contractKey = item.getBindingContext().getProperty("PurchaseContract/Key") as string;

    if (!contractKey) {
      MessageBox.error("Contrato do washout não encontrado.");
      return;
    }

    // readonly=true: o aprovador só visualiza; a tela de detalhe esconde toda ação.
    this.navTo("purchaseContractsDetail", { id: contractKey, "?query": { readonly: "true" } });
  }

  onCloseWashoutDecisionDialog(): void {
    this._decisionDialog?.close();
  }

  async onConfirmWashoutDecision(): Promise<void> {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const state = viewModel.getProperty("/washoutDecision") as WashoutDecisionState;
    const comments = (state.comments ?? "").trim();
    const isApprove = state.action === "Approve";

    if (!isApprove && !comments) {
      MessageBox.error("Informe o motivo da rejeição.");
      return;
    }

    // Mesmo padrão do registro/estorno na tela do contrato: diálogo aberto e ocupado durante o
    // invoke, para não perder os comentários digitados se o servidor recusar.
    this._decisionDialog?.setBusy(true);
    this.setBusy(true);

    const oModel = this.getView().getModel() as ODataModel;
    const action = oModel.bindContext(
      isApprove ? this.api.purchaseContractsWashoutApproval : this.api.purchaseContractsWashoutReject
    );
    action.setParameter("Key", state.key);
    action.setParameter("Comments", comments);

    try {
      await action.invoke();
      MessageToast.show(isApprove ? "Washout aprovado." : "Washout rejeitado.");
      this.onCloseWashoutDecisionDialog();
      this.onRefresh();
    } catch (err) {
      MessageBox.error(
        (err as Error).message || (isApprove ? "Erro ao aprovar washout." : "Erro ao rejeitar washout.")
      );
    } finally {
      this._decisionDialog?.setBusy(false);
      this.setBusy(false);
    }
  }

  /**
   * Resumo do que se decide: volumes e o valor que vira título a receber. getProperty devolve
   * Edm.Decimal como string, daí o Number().
   */
  private async openDecisionDialog(action: WashoutDecision): Promise<void> {
    const item = (this.byId("washoutApprovalTable") as Table).getSelectedItem();

    if (!item) {
      MessageBox.alert("Selecione um washout.");
      return;
    }

    const ctx = item.getBindingContext() as Context;
    const fixedVolume = Number(ctx.getProperty("FixedVolume") ?? 0);
    const unfixedVolume = Number(ctx.getProperty("UnfixedVolume") ?? 0);
    const amount = Number(ctx.getProperty("Amount") ?? 0);
    const code = (ctx.getProperty("PurchaseContract/Code") as string) ?? "";
    const sequence = ctx.getProperty("Sequence") as number;
    const isApprove = action === "Approve";

    const state: WashoutDecisionState = {
      action,
      key: ctx.getProperty("Key") as string,
      title: isApprove ? "Aprovar Washout?" : "Rejeitar Washout?",
      summary:
        `Contrato ${code} WO-${sequence}: ${formatNumberPtBr(fixedVolume, 3)} fixado + ` +
        `${formatNumberPtBr(unfixedVolume, 3)} não fixado. Valor a receber: R$ ${formatNumberPtBr(amount, 2)}.`,
      comments: "",
      placeholder: isApprove ? "Comentários (opcional)" : "Motivo da rejeição (obrigatório)",
      confirmText: isApprove ? "Aprovar" : "Rejeitar",
    };
    (this.getModel("viewModel") as JSONModel).setProperty("/washoutDecision", state);

    this._decisionDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.purchaseContracts.washoutApproval.fragments.WashoutDecisionDialog"
    );

    this._decisionDialog?.open();
  }
}
