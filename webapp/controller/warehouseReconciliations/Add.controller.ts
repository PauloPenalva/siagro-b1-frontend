import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export default class Add extends BaseController {
  protected warnIfOpen = true;

  onInit(): void {
    this.initReconciliationModel();
    this.getRouter().getRoute("warehouseReconciliationsNew")
      .attachPatternMatched(() => void this.prepare());
  }

  private async prepare(): Promise<void> {
    (this.getModel("ui") as JSONModel).setProperty("/editable", true);
    this.startDocNumberCreate();
    this.resetModelChanges();
    this.resetPreview();
    this.wr().setProperty("/savedLines", []);

    this.setBusy(true);
    try {
      const branchInfo = await this.getBranchInfo();
      const systemSetup = this.getSystemSetup();
      const docNumberInfo = (await this.getDocNumberInfoByTransaction("WarehouseReconciliation")).find(x => x.Default);
      const oBinding = (this.getModel() as ODataModel).bindList("/WarehouseReconciliations");

      // Toda propriedade editável precisa existir no create inicial, nem que seja null.
      const oContext = oBinding.create({
        Status: "Draft",
        // Sempre enviar a série; Code só é preenchido na série Manual.
        DocNumberKey: docNumberInfo?.Key ?? null,
        Code: null,
        BranchCode: branchInfo?.code ?? null,
        WarehouseCode: "",
        WarehouseName: null,
        ItemCode: "",
        ItemName: null,
        UnitOfMeasureCode: systemSetup.DefaultUoM ?? "",
        ReferenceDate: this.todayAtNoonIso(),
        ReportedBalance: 0,
        ReasonKey: null,
        Comments: null,
      }, false, false, false);

      this.getView().setBindingContext(oContext);
    } finally {
      this.setBusy(false);
    }
  }

  async onSave(): Promise<void> {
    const ctx = this.getView().getBindingContext() as Context;
    if (!this.validateReconciliation(ctx)) return;

    const oModel = this.getModel() as ODataModel;
    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());
      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) return;

      const key = ctx.getProperty("Key") as string;

      // A distribuição só pode ser gravada depois que a conferência existe. Se o servidor recusar,
      // a conferência já está salva em rascunho: leva para a edição, onde o usuário corrige.
      if (!(await this.saveDistribution(key))) {
        this.navTo("warehouseReconciliationsEdit", { id: key });
        return;
      }

      // Gravar a distribuição muda a versão (ETag) da conferência no servidor. Este contexto criado
      // ainda guarda a versão antiga, e um campo da tela que pedisse um valor dele depois
      // (ex.: a série, DocNumberKey) recebia "ETag changed" (GAC-1210). O Detail lê o registro de novo.
      this.getView().setBindingContext(null);
      MessageToast.show("Conferência gravada em rascunho.");
      this.navTo("warehouseReconciliationsDetail", { id: key });
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao gravar a conferência.");
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.resetModelChanges();
    this.navTo("warehouseReconciliations");
  }
}
