import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * @namespace siagrob1.controller.warehouseReconciliationReasons
 */
export default class Add extends CommonController {

  onInit(): void {
    this.getRouter().getRoute("warehouseReconciliationReasonsAdd")
      .attachPatternMatched(() => this.prepare());
  }

  private prepare(): void {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    // Motivo nasce ativo; desativar é decisão da edição.
    uiModel.setProperty("/reasonActiveVisible", false);

    this.resetModelChanges();

    const oBinding = (this.getModel() as ODataModel).bindList("/WarehouseReconciliationReasons");
    const oContext = oBinding.create({ Code: "", Description: "", Active: true }, false, false, false);
    this.getView().setBindingContext(oContext);
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

      MessageToast.show("Motivo incluído.");
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
