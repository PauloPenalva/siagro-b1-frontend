import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export default class Detail extends BaseController {

  onInit(): void {
    this.initReconciliationModel();
    this.getRouter().getRoute("warehouseReconciliationsDetail")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    // A view é reaproveitada entre navegações: sem isto, os anexos e a trava de edição da
    // conferência anterior ficam visíveis (e acionáveis) até `loadAttachments`/`dataReceived`
    // resolverem para a nova.
    (this.getModel("attachments") as JSONModel)?.setData([]);
    this.wr().setProperty("/attachmentsReadonly", true);

    (this.getModel("ui") as JSONModel).setProperty("/editable", false);
    this.resetPreview();

    this.bindElement(`/WarehouseReconciliations(${id})`);
    this.afterDataReceived();
    void this.loadAttachments(id);
  }

  /** A prévia depende de armazém, produto e data, que só existem depois da leitura. */
  private afterDataReceived(): void {
    this.getView().getElementBinding()?.attachEventOnce("dataReceived", () => {
      const ctx = this.getView().getBindingContext() as Context;

      // Anexar/Remover só ficam disponíveis enquanto a conferência ainda pode ser alterada; o
      // backend já recusa o upload/exclusão fora de Draft/InApproval (400), então a tela
      // simplesmente esconde os botões para Approved/Rejected/Cancelled.
      const isOpen = ["Draft", "InApproval"].includes(String(ctx?.getProperty("Status")));
      this.wr().setProperty("/attachmentsReadonly", !isOpen);

      // A prévia é "saldo de hoje até a data de referência": uma vez decidida (Approved,
      // Rejected, Cancelled), o que vale é o snapshot gravado — mostrar a prévia ao lado
      // dele confundiria o usuário com dois números diferentes para a mesma conferência.
      if (isOpen) {
        void this.refreshPreview(ctx);
      } else {
        this.resetPreview();
      }
    });
  }

  private reload(): void {
    this.afterDataReceived();
    this.getView().getElementBinding()?.refresh();
  }

  onBackToList(): void {
    this.navTo("warehouseReconciliations");
  }

  onEdit(): void {
    this.navTo("warehouseReconciliationsEdit", { id: this.currentKey() });
  }

  async onSendApproval(): Promise<void> {
    if (!(await DialogHelper.confirmDialog("Enviar a conferência para aprovação ?"))) return;
    if (await this.runAction(this.api.warehouseReconciliationsSendApproval, { Key: this.currentKey() },
      "Conferência enviada para aprovação.")) {
      this.reload();
    }
  }

  async onWithdrawApproval(): Promise<void> {
    if (!(await DialogHelper.confirmDialog("Retirar a conferência da aprovação ?"))) return;
    if (await this.runAction(this.api.warehouseReconciliationsWithdrawApproval, { Key: this.currentKey() },
      "Conferência retirada da aprovação.")) {
      this.reload();
    }
  }

  onCancelReconciliation(): void {
    void this.openDecision("Cancel", "Cancelar a conferência ?", "Cancelar conferência", "Motivo do cancelamento", true);
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected async executeDecision(action: string, text: string | null): Promise<boolean> {
    if (action !== "Cancel") return super.executeDecision(action, text);

    const ok = await this.runAction(this.api.warehouseReconciliationsCancel, { Key: this.currentKey(), Reason: text },
      "Conferência cancelada.");
    if (ok) {
      this.reload();
    }
    return ok;
  }
}
