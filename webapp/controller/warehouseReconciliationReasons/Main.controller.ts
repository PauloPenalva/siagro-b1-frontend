import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { sendJson } from "siagrob1/helpers/FetchHelpers";

/**
 * @namespace siagrob1.controller.warehouseReconciliationReasons
 */
export default class Main extends CommonController {

  onInit(): void {
    this.getRouter().getRoute("warehouseReconciliationReasons")
      .attachPatternMatched(() => this.onRefresh());
  }

  onRefresh(): void {
    (this.byId("warehouseReconciliationReasonsTable").getBinding("rows") as ODataListBinding)?.refresh();
  }

  onCreate(): void {
    this.navTo("warehouseReconciliationReasonsAdd");
  }

  onEdit(): void {
    const ctx = this.selectedContext();
    if (!ctx) return;
    this.navTo("warehouseReconciliationReasonsEdit", { id: ctx.getProperty("Key") as string });
  }

  async onDelete(): Promise<void> {
    const ctx = this.selectedContext();
    if (!ctx) return;

    if (!(await DialogHelper.confirmDialog("Excluir o motivo selecionado ?"))) return;

    this.setBusy(true);
    try {
      // fetch e não context.delete(): o motivo em uso volta 400 com mensagem de negócio
      // ("desative em vez de excluir") que precisa chegar inteira ao usuário.
      const result = await sendJson("DELETE", `/odata/WarehouseReconciliationReasons(${ctx.getProperty("Key") as string})`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Motivo excluído.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  private selectedContext(): Context | null {
    const table = this.byId("warehouseReconciliationReasonsTable") as Table;
    const i = table.getSelectedIndex();
    if (i < 0) {
      MessageBox.warning("Selecione um motivo.");
      return null;
    }
    return table.getContextByIndex(i) as Context;
  }
}
