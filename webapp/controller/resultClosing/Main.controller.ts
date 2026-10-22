import CommonController from "siagrob1/controller/common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { odataCollection, sendJson } from "siagrob1/helpers/FetchHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";

type Row = Record<string, unknown>;

/** Lê a propriedade em PascalCase ou camelCase (OData do Web x REST). */
function prop<T>(row: Row, name: string): T {
  return (row[name] ?? row[name.charAt(0).toLowerCase() + name.slice(1)]) as T;
}

/**
 * Apuração de resultado (CTBA211): prévia dos saldos das contas de resultado, apurar (zera contra a conta de
 * apuração, um lançamento por filial) e estornar a última apuração.
 * @namespace siagrob1.controller.resultClosing
 */
export default class Main extends CommonController {
  onInit(): void {
    const today = new Date();
    const lastOfPreviousMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    this.getView().setModel(new JSONModel({
      Date: localIsoDate(lastOfPreviousMonth), BranchCode: "", History: "", Preview: [], Entries: [], PreviewTotal: 0,
    }), "rc");
  }

  private model(): JSONModel {
    return this.getView().getModel("rc") as JSONModel;
  }

  private branch(): string {
    const b = (this.model().getProperty("/BranchCode") as string)?.trim();
    return b ? b : undefined;
  }

  private date(): string {
    const d = this.model().getProperty("/Date") as string;
    if (!d) MessageBox.warning("Informe a data da apuração.");
    return d || undefined;
  }

  async onPreview(): Promise<void> {
    const date = this.date();
    if (!date) return;
    const branch = this.branch();
    const url = `${ServerRoutes.resultClosingPreview}(Date=${date}T00:00:00Z,BranchCode=${branch ? `'${branch}'` : "''"})`;
    this.setBusy(true);
    try {
      const result = await sendJson("GET", url);
      if (!result.ok) { MessageBox.error(result.message); return; }
      const rows = odataCollection<Row>(result.data).map((r) => {
        const balance = prop<number>(r, "Balance");
        return {
          BranchCode: prop<string>(r, "BranchCode"),
          AccountCode: prop<string>(r, "AccountCode"),
          CostCenterCode: prop<string>(r, "CostCenterCode") ?? "",
          AccountingItemCode: prop<string>(r, "AccountingItemCode") ?? "",
          Amount: Math.abs(balance),
          Side: balance > 0 ? "D" : "C",
        };
      });
      this.model().setProperty("/Preview", rows);
      if (rows.length === 0) MessageToast.show("Nada a apurar nesta data.");
    } finally {
      this.setBusy(false);
    }
  }

  async onRun(): Promise<void> {
    const date = this.date();
    if (!date) return;
    if (!(await confirmDialog(`Deseja apurar o resultado até ${date.split("-").reverse().join("/")} ?`, "Apurar resultado ?"))) return;
    await this.post(ServerRoutes.resultClosingRun, {
      Date: `${date}T00:00:00Z`, BranchCode: this.branch() ?? null, History: (this.model().getProperty("/History") as string) || null,
    }, "Resultado apurado.");
    await this.onPreview();
  }

  async onReverse(): Promise<void> {
    if (!(await confirmDialog("Deseja estornar a última apuração de resultado ?", "Estornar apuração ?"))) return;
    await this.post(ServerRoutes.resultClosingReverse, { BranchCode: this.branch() ?? null }, "Apuração estornada.");
  }

  private async post(url: string, payload: object, done: string): Promise<void> {
    this.setBusy(true);
    try {
      const result = await sendJson("POST", url, payload);
      if (!result.ok) { MessageBox.error(result.message); return; }
      const entries = odataCollection<Row>(result.data).map((e) => ({
        DocEntry: prop<number>(e, "DocEntry"),
        BranchCode: prop<string>(e, "BranchCode"),
        PostingDate: prop<string>(e, "PostingDate"),
        Document: `${prop<string>(e, "Batch")}/${prop<string>(e, "DocumentNumber")}`,
        Origin: prop<string>(e, "Origin"),
      }));
      this.model().setProperty("/Entries", entries);
      MessageToast.show(entries.length ? done : "Nada a apurar nesta data.");
    } finally {
      this.setBusy(false);
    }
  }
}
