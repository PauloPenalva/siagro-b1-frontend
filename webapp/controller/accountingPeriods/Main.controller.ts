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

/** Valores numéricos de AccountingPeriodStatus no backend (a action recebe o número). */
const STATUS = { Open: 1, Closed: 2, Blocked: 4 } as const;

type ReopenForm = { Id: number; MonthText: string; Reason: string };

/**
 * Calendário contábil (CTG/CQD do Protheus): gera o exercício e fecha, bloqueia ou reabre cada mês. As regras
 * (ordem de fechamento, motivo, papel ADMIN) ficam no servidor; a recusa vem como 400 com mensagem pt-BR.
 *
 * @namespace siagrob1.controller.accountingPeriods
 */
export default class Main extends CommonController {
  private reopenDialog: Dialog;

  onInit(): void {
    this.getView().setModel(new JSONModel({ Year: new Date().getFullYear() }), "calendar");
    this.getView().setModel(new JSONModel({}), "reopen");
    this.getRouter().getRoute("accountingPeriods").attachPatternMatched(() => this.onRefresh());
  }

  private table(): Table {
    return this.byId("accountingPeriodsTable") as Table;
  }

  private year(): number {
    return Number((this.getView().getModel("calendar") as JSONModel).getProperty("/Year"));
  }

  onYearChange(): void {
    this.onRefresh();
  }

  onRefresh(): void {
    const binding = this.table().getBinding("rows") as ODataListBinding;
    binding?.filter([new Filter("Year", FilterOperator.EQ, this.year())]);
  }

  monthText(month: number, year: number): string {
    if (!month || !year) return "";
    return `${String(month).padStart(2, "0")}/${year}`;
  }

  private selected(): Context | undefined {
    const i = this.table().getSelectedIndex();
    return i < 0 ? undefined : (this.table().getContextByIndex(i) as Context);
  }

  async onGenerateYear() {
    const year = this.year();
    if (!(await confirmDialog(`Deseja gerar os meses do exercício ${year} ?`, "Gerar exercício ?"))) return;
    await this.post(ServerRoutes.accountingPeriodsGenerateYear, { Year: year }, "Exercício gerado.");
  }

  async onClosePeriod() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione um mês.");
      return;
    }
    const text = this.monthText(ctx.getProperty("Month") as number, ctx.getProperty("Year") as number);
    if (!(await confirmDialog(`Deseja fechar o período ${text} ?`, "Fechar período ?"))) return;
    await this.setStatus(ctx, STATUS.Closed, "Período fechado.");
  }

  async onBlockPeriod() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione um mês.");
      return;
    }
    await this.setStatus(ctx, STATUS.Blocked, "Período bloqueado.");
  }

  async onReopenPeriod() {
    const ctx = this.selected();
    if (!ctx) {
      MessageBox.alert("Selecione um mês.");
      return;
    }
    const status = ctx.getProperty("Status") as string;
    if (status === "Open") {
      MessageBox.alert("O período selecionado já está aberto.");
      return;
    }
    if (status === "Blocked") {
      // Desbloquear é trava temporária: não pede motivo.
      await this.setStatus(ctx, STATUS.Open, "Período desbloqueado.");
      return;
    }

    const form: ReopenForm = {
      Id: ctx.getProperty("Id") as number,
      MonthText: this.monthText(ctx.getProperty("Month") as number, ctx.getProperty("Year") as number),
      Reason: "",
    };
    (this.getView().getModel("reopen") as JSONModel).setData(form);
    this.reopenDialog ??= await DialogHelper.createDialog(this, "siagrob1.view.accountingPeriods.fragments.ReopenDialog");
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
    if (await this.post(ServerRoutes.accountingPeriodsSetStatus,
      { Id: data.Id, Status: STATUS.Open, Reason: data.Reason.trim() }, "Período reaberto.")) {
      this.reopenDialog.close();
    }
  }

  private setStatus(ctx: Context, status: number, done: string) {
    return this.post(ServerRoutes.accountingPeriodsSetStatus,
      { Id: ctx.getProperty("Id") as number, Status: status, Reason: null }, done);
  }

  private async post(url: string, payload: object, done: string): Promise<boolean> {
    this.setBusy(true);
    try {
      const result = await sendJson("POST", url, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return false;
      }
      MessageToast.show(done);
      (this.table().getBinding("rows") as ODataListBinding)?.refresh();
      return true;
    } finally {
      this.setBusy(false);
    }
  }
}
