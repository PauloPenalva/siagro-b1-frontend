import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";

export default class Edit extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("financialAccountsEdit")
      .attachPatternMatched((ev) => this.routeMatched(ev));
  }

  private routeMatched(ev: Route$MatchedEvent): void {
    const { code } = ev.getParameter("arguments") as { code: string };
    if (code == null) return;

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    // A chave nunca é editável depois de gravada.
    uiModel.setProperty("/codeEditable", false);

    this.bindElement(`/FinancialAccounts('${code}')`);

    this.getView().getElementBinding()?.attachEventOnce("dataReceived", () => {
      const ctx = this.getView().getBindingContext() as Context;
      uiModel.setProperty("/isBank", ctx?.getProperty("Type") === "Bank");
    });
  }

  onTypeChange(): void {
    const ctx = this.getView().getBindingContext() as Context;
    (this.getModel("ui") as JSONModel)
      .setProperty("/isBank", ctx?.getProperty("Type") === "Bank");
  }

  async onSave(): Promise<void> {
    if (!this.validateFinancialForm("financialAccountForm")) return;

    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        return;
      }

      MessageToast.show("Conta financeira alterada.");
      this.navTo("financialAccounts");
    } catch (err) {
      MessageBox.error((err as Error).message || "Erro ao gravar a conta financeira.");
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.resetModelChanges();
    this.navTo("financialAccounts");
  }
}
