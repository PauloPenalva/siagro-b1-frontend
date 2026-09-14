import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * @namespace siagrob1.controller.warehouseReconciliationReasons
 */
export default class Edit extends CommonController {

  onInit(): void {
    this.getRouter().getRoute("warehouseReconciliationReasonsEdit")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/reasonActiveVisible", true);

    this.resetModelChanges();
    this.bindElement(`/WarehouseReconciliationReasons(${id})`);
  }

  async onSave(): Promise<void> {
    const ctx = this.getView().getBindingContext() as Context;
    if (!String(ctx?.getProperty("Code") ?? "").trim() || !String(ctx?.getProperty("Description") ?? "").trim()) {
      MessageBox.warning("Informe o código e a descrição do motivo.");
      return;
    }

    const oModel = this.getModel() as ODataModel;
    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());
      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) return;

      MessageToast.show("Motivo alterado.");
      this.navTo("warehouseReconciliationReasons");
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao gravar o motivo.");
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.resetModelChanges();
    this.navTo("warehouseReconciliationReasons");
  }
}
