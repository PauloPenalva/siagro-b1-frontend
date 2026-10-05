import BaseController from "../BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { odataCollection, sendJson } from "siagrob1/helpers/FetchHelpers";
import { PAYMENT_MEANS, PAYMENT_START_RULES, paymentPreviewUrl } from "siagrob1/helpers/NfeHelpers";

type ConditionForm = {
  code?: number;
  name: string;
  days: string;
  startRule: string;
  paymentMeans: string;
  inactive: boolean;
  previewTotal: number | string;
  previewDate: string;
  preview: unknown[];
  startRules: unknown[];
  paymentMeansList: unknown[];
};

/**
 * Condições de pagamento (só STANDALONE — o menu some nos outros modos e o servidor recusa).
 * Mesmo desenho da tela de alíquotas IBS/CBS: lista OData + diálogo com JSONModel.
 *
 * @namespace siagrob1.controller.paymentConditions
 */
export default class Main extends BaseController {
  private conditionDialog: Dialog;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "condition");
    this.getRouter().getRoute("paymentConditions").attachPatternMatched(() => this.onRefresh());
  }

  formatStartRule(value: string): string {
    return PAYMENT_START_RULES.find((r) => r.key === value)?.text ?? value;
  }

  formatPaymentMeans(value: string): string {
    return PAYMENT_MEANS.find((m) => m.key === value)?.text ?? value;
  }

  formatIsoDate(value: string): string {
    return value ? value.split("-").reverse().join("/") : "";
  }

  formatAmount(value: number | string): string {
    return Number(value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private table(): Table {
    return this.byId("paymentConditionsTable") as Table;
  }

  onRefresh(): void {
    (this.table().getBinding("rows") as ODataListBinding)?.refresh();
  }

  private selected(): Context | undefined {
    const i = this.table().getSelectedIndex();
    return i < 0 ? undefined : (this.table().getContextByIndex(i) as Context);
  }

  async onCreate() {
    await this.openDialog({ name: "", days: "0", startRule: "IssueDate", paymentMeans: "15", inactive: false });
  }

  async onEdit() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione uma condição para editar.");
      return;
    }

    await this.openDialog({
      code: ctx.getProperty("Code") as number,
      name: ctx.getProperty("Name") as string,
      days: ctx.getProperty("Days") as string,
      startRule: ctx.getProperty("StartRule") as string,
      paymentMeans: ctx.getProperty("PaymentMeans") as string,
      inactive: ctx.getProperty("Inactive") as boolean,
    });
  }

  private async openDialog(data: Partial<ConditionForm>) {
    (this.getView().getModel("condition") as JSONModel).setData({
      ...data,
      previewTotal: 1000,
      previewDate: new Date().toISOString().slice(0, 10),
      preview: [],
      startRules: PAYMENT_START_RULES,
      paymentMeansList: PAYMENT_MEANS,
    });
    this.conditionDialog ??= await DialogHelper.createDialog(this, "siagrob1.view.paymentConditions.fragments.ConditionDialog");
    this.conditionDialog.open();
  }

  onCancelCondition() {
    this.conditionDialog?.close();
  }

  async onPreview() {
    const model = this.getView().getModel("condition") as JSONModel;
    const data = model.getData() as ConditionForm;
    const result = await sendJson("GET", paymentPreviewUrl(
      data.days, data.startRule, data.paymentMeans, Number(data.previewTotal), data.previewDate));

    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    model.setProperty("/preview", odataCollection(result.data));
  }

  async onConfirmCondition() {
    const data = (this.getView().getModel("condition") as JSONModel).getData() as ConditionForm;

    if (!data.name?.trim() || !data.days?.trim()) {
      MessageBox.warning("Informe o nome e os dias da condição.");
      return;
    }

    const model = this.getView().getModel() as ODataModel;
    const groupId = model.getUpdateGroupId();
    const payload: Record<string, string | boolean> = {
      Name: data.name.trim(),
      Days: data.days.trim(),
      StartRule: data.startRule,
      PaymentMeans: data.paymentMeans,
      Inactive: data.inactive,
    };

    try {
      this.setBusy(true);

      if (data.code == null) {
        (this.table().getBinding("rows") as ODataListBinding).create(payload, true);
      } else {
        const ctx = this.selected();
        // Sem await: com o grupo diferido a promise só resolve depois do submitBatch.
        Object.entries(payload).forEach(([name, value]) => void ctx.setProperty(name, value));
      }

      await model.submitBatch(groupId);

      if (model.hasPendingChanges(groupId)) {
        // A mensagem do servidor já foi mostrada pelo handler global; desfaz para não reenviar.
        model.resetChanges(groupId);
        return;
      }

      this.conditionDialog.close();
      MessageToast.show("Condição de pagamento gravada.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  async onDelete() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione uma condição para excluir.");
      return;
    }

    if (!(await confirmDialog("Deseja realmente excluir a condição selecionada ?", "Excluir condição ?"))) {
      return;
    }

    const model = this.getView().getModel() as ODataModel;

    try {
      this.setBusy(true);
      await ctx.delete("$auto");
      await model.submitBatch(model.getUpdateGroupId());
      MessageToast.show("Condição excluída.");
    } finally {
      this.setBusy(false);
    }
  }
}
