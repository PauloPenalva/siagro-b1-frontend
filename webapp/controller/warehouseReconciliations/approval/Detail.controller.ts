import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import { BaseController } from "../BaseController";

/**
 * Tela do aprovador. O snapshot mostrado é o do envio; a aprovação recalcula no servidor, e a
 * prévia ao lado mostra o saldo de hoje até a data de referência para o aprovador comparar.
 *
 * @namespace siagrob1.controller.warehouseReconciliations.approval
 */
export default class Detail extends BaseController {

  onInit(): void {
    this.initReconciliationModel().setProperty("/attachmentsReadonly", true);
    this.getRouter().getRoute("warehouseReconciliationsApprovalDetail")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    // A view é reaproveitada entre navegações: sem isto, os anexos da conferência anterior
    // ficam visíveis até `loadAttachments` resolver para a nova.
    (this.getModel("attachments") as JSONModel)?.setData([]);

    (this.getModel("ui") as JSONModel).setProperty("/editable", false);
    this.resetPreview();

    this.bindElement(`/WarehouseReconciliations(${id})`);
    this.getView().getElementBinding()?.attachEventOnce("dataReceived", () => {
      const ctx = this.getView().getBindingContext() as Context;

      // Mesma regra da tela de detalhe: a prévia só faz sentido enquanto a conferência ainda
      // não foi decidida (o aprovador a usa para comparar antes de decidir); depois disso o
      // que vale é o snapshot gravado.
      if (["Draft", "InApproval"].includes(String(ctx?.getProperty("Status")))) {
        void this.refreshPreview(ctx);
      } else {
        this.resetPreview();
      }
    });
    void this.loadAttachments(id);
  }

  onBackToList(): void {
    this.navTo("warehouseReconciliationsApproval");
  }

  onApprove(): void {
    void this.openDecision("Approval", "Aprovar a conferência ?", "Aprovar", "Comentários (opcional)", false);
  }

  onReject(): void {
    void this.openDecision("Reject", "Rejeitar a conferência ?", "Rejeitar", "Motivo da rejeição", true);
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected async executeDecision(action: string, text: string | null): Promise<boolean> {
    const url = action === "Approval"
      ? this.api.warehouseReconciliationsApproval
      : action === "Reject" ? this.api.warehouseReconciliationsReject : null;

    if (!url) return super.executeDecision(action, text);

    const ok = await this.runAction(url, { Key: this.currentKey(), Comments: text },
      action === "Approval" ? "Conferência aprovada. Romaneio de perda/sobra gerado." : "Conferência rejeitada.");

    if (ok) {
      this.navTo("warehouseReconciliationsApproval");
    }
    return ok;
  }
}
