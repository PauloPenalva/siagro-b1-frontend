import CommonController from "siagrob1/controller/common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Dialog from "sap/m/Dialog";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Context from "sap/ui/model/odata/v4/Context";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";

type ReopenForm = { BranchCode: string; Year: number; Month: number; MonthText: string; Reason: string };

/**
 * Fechamento mensal do estoque fiscal por filial (só STANDALONE). A lista só tem os meses já fechados alguma vez;
 * o mês a fechar é escolhido no cabeçalho. Fechar/reabrir são actions OData de topo chamadas por fetch — a recusa
 * do servidor (400 com mensagem pt-BR) vai para MessageBox.error.
 *
 * @namespace siagrob1.controller.fiscalStockPeriods
 */
export default class Main extends CommonController {
  private reopenDialog: Dialog;

  onInit(): void {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const period = new JSONModel({ BranchCode: "", Month: month });
    this.getView().setModel(period, "period");
    // A lista mostra só a filial escolhida (todas enquanto vazia); reaplica a cada troca, inclusive pelo value help.
    period.bindProperty("/BranchCode").attachChange(() => this.applyBranchFilter());
    this.getView().setModel(new JSONModel({}), "reopen");
    this.getRouter().getRoute("fiscalStockPeriods").attachPatternMatched(() => this.onRefresh());
  }

  private table(): Table {
    return this.byId("periodsTable") as Table;
  }

  private applyBranchFilter(): void {
    const branch = (this.getView().getModel("period") as JSONModel).getProperty("/BranchCode") as string;
    (this.table().getBinding("rows") as ODataListBinding)?.filter(
      branch ? [new Filter("BranchCode", FilterOperator.EQ, branch)] : []);
  }

  onRefresh(): void {
    this.applyBranchFilter();
    (this.table().getBinding("rows") as ODataListBinding)?.refresh();
  }

  monthText(month: number, year: number): string {
    if (!month || !year) return "";
    return `${String(month).padStart(2, "0")}/${year}`;
  }

  async onClose() {
    const data = (this.getView().getModel("period") as JSONModel).getData() as { BranchCode: string; Month: string };
    if (!data.BranchCode) {
      MessageBox.warning("Informe a filial.");
      return;
    }
    const match = /^(\d{4})-(\d{2})$/.exec(data.Month ?? "");
    if (!match) {
      MessageBox.warning("Informe o mês.");
      return;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);

    if (!(await confirmDialog(
      `Deseja fechar o mês ${this.monthText(month, year)} da filial ${data.BranchCode} ?`, "Fechar mês ?"))) {
      return;
    }

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.fiscalStockPeriodsClose, {
        BranchCode: data.BranchCode, Year: year, Month: month,
      });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("Mês fechado.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  async onReopen() {
    const i = this.table().getSelectedIndex();
    const ctx = i < 0 ? undefined : (this.table().getContextByIndex(i) as Context);
    if (!ctx) {
      MessageBox.alert("Selecione um mês para reabrir.");
      return;
    }
    if (ctx.getProperty("Status") !== "Closed") {
      MessageBox.alert("O mês selecionado não está fechado.");
      return;
    }

    const year = Number(ctx.getProperty("Year"));
    const month = Number(ctx.getProperty("Month"));
    const form: ReopenForm = {
      BranchCode: ctx.getProperty("BranchCode") as string,
      Year: year, Month: month, MonthText: this.monthText(month, year), Reason: "",
    };
    (this.getView().getModel("reopen") as JSONModel).setData(form);
    this.reopenDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.fiscalStockPeriods.fragments.ReopenDialog");
    this.reopenDialog.open();
  }

  onCancelReopen() {
    this.reopenDialog?.close();
  }

  async onConfirmReopen() {
    const data = (this.getView().getModel("reopen") as JSONModel).getData() as ReopenForm;
    if (!data.Reason?.trim()) {
      MessageBox.warning("Informe o motivo da reabertura.");
      return;
    }

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.fiscalStockPeriodsReopen, {
        BranchCode: data.BranchCode, Year: data.Year, Month: data.Month, Reason: data.Reason.trim(),
      });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      this.reopenDialog.close();
      MessageToast.show("Mês reaberto.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }
}
