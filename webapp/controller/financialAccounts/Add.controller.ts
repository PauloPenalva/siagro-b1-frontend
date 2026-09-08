import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { BaseController } from "./BaseController";

export default class Add extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("financialAccountsAdd")
      .attachPatternMatched(() => this.prepare());
  }

  private prepare(): void {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    uiModel.setProperty("/codeEditable", true);
    uiModel.setProperty("/isBank", false);

    const oBinding = (this.getModel() as ODataModel).bindList("/FinancialAccounts");

    // Toda propriedade editável precisa existir no create inicial, nem que seja null.
    const oContext = oBinding.create({
      Code: "",
      Name: "",
      Type: "Cash",
      Currency: "Brl",
      BankCode: null,
      BankName: null,
      BankBranch: null,
      BankAccountNumber: null,
      BranchCode: null,
      Inactive: false,
    }, false, false, false);

    this.getView().setBindingContext(oContext);
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

      MessageToast.show("Conta financeira incluída.");
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
