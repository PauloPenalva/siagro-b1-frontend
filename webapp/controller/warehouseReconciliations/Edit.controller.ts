import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export default class Edit extends BaseController {

  onInit(): void {
    this.initReconciliationModel();
    this.getRouter().getRoute("warehouseReconciliationsEdit")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    (this.getModel("ui") as JSONModel).setProperty("/editable", true);
    this.resetModelChanges();
    this.resetPreview();
    this.wr().setProperty("/savedLines", []);

    this.bindElement(`/WarehouseReconciliations(${id})`);
    this.getView().getElementBinding()?.attachEventOnce("dataReceived", () => {
      const ctx = this.getView().getBindingContext() as Context;
      if (ctx?.getProperty("Status") !== "Draft") {
        MessageBox.warning("Somente conferências em rascunho podem ser alteradas.");
        this.navTo("warehouseReconciliationsDetail", { id });
        return;
      }
      void this.loadSavedLines(id).then(() => this.refreshPreview(ctx));
    });
  }

  async onSave(): Promise<void> {
    const ctx = this.getView().getBindingContext() as Context;
    if (!this.validateReconciliation(ctx)) return;

    const oModel = this.getModel() as ODataModel;
    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());
      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) return;

      if (!(await this.saveDistribution(ctx.getProperty("Key") as string))) return;

      MessageToast.show("Conferência alterada.");
      this.navTo("warehouseReconciliationsDetail", { id: ctx.getProperty("Key") as string });
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao gravar a conferência.");
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    const ctx = this.getView().getBindingContext() as Context;
    this.resetModelChanges();
    this.navTo("warehouseReconciliationsDetail", { id: ctx?.getProperty("Key") as string });
  }
}
