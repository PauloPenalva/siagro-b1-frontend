import CommonController from "siagrob1/controller/common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { EdmType } from "sap/ui/export/library";
import { Table$RowSelectionChangeEvent } from "sap/ui/table/Table";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import {
  DOCUMENT_TYPE_TEXT, MODULES, MODULE_TEXT, RESULT_TEXT, STATUS_TEXT, isActive, loadRun, loadRuns, requestRun,
} from "./OfflinePostingApi";

const POLL_MS = 3000;

/**
 * Contabilização off-line (CTBANFE / CTBANFS / FINA370): pede uma simulação ou um processamento ao backend, que roda
 * num job; a tela acompanha a execução e mostra o relatório de cada documento.
 * @namespace siagrob1.controller.offlinePosting
 */
export default class Main extends CommonController {
  private timer?: ReturnType<typeof setTimeout>;
  private onRoute = false;

  onInit(): void {
    const today = new Date();
    this.getView().setModel(new JSONModel({
      DateFrom: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      DateTo: localIsoDate(today),
      BranchCode: "",
      PurchaseInvoices: true,
      SalesInvoices: true,
      Financial: true,
    }), "params");
    this.getView().setModel(new JSONModel({ Runs: [], Selected: null, Items: [], Busy: false }), "op");

    const route = this.getRouter().getRoute("offlinePosting");
    route.attachPatternMatched(() => { this.onRoute = true; void this.onRefresh(); });
    this.getRouter().attachRouteMatched((ev) => {
      if (ev.getParameter("name") !== "offlinePosting") { this.onRoute = false; this.stopPolling(); }
    });
  }

  onExit(): void {
    this.stopPolling();
  }

  private op(): JSONModel {
    return this.getView().getModel("op") as JSONModel;
  }

  private stopPolling(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async onRefresh(): Promise<void> {
    this.stopPolling();
    try {
      const runs = (await loadRuns()).map((r) => ({
        ...r,
        StatusText: STATUS_TEXT[r.Status] ?? r.Status,
        KindText: r.Simulation ? "Simulação" : "Processamento",
        ModulesText: r.Modules.split(",").map((m) => MODULE_TEXT[m] ?? m).join(", "),
        BranchText: r.BranchCode || "Todas",
      }));
      const busy = runs.some((r) => isActive(r.Status));
      this.op().setProperty("/Runs", runs);
      this.op().setProperty("/Busy", busy);

      const selected = this.op().getProperty("/Selected") as string;
      const toShow = selected ?? runs[0]?.Key;
      if (toShow) await this.showRun(toShow);
      if (busy && this.onRoute) this.timer = setTimeout((): void => { void this.onRefresh(); }, POLL_MS);
    } catch (e) {
      MessageBox.error((e as Error).message);
    }
  }

  private async showRun(key: string): Promise<void> {
    const run = await loadRun(key);
    this.op().setProperty("/Selected", key);
    this.op().setProperty("/Current", { ...run, StatusText: STATUS_TEXT[run.Status] ?? run.Status });
    this.op().setProperty("/Items", (run.Items ?? []).map((i) => ({
      ...i,
      DocumentTypeText: DOCUMENT_TYPE_TEXT[i.DocumentType] ?? i.DocumentType,
      ResultText: RESULT_TEXT[i.Result] ?? i.Result,
    })));
  }

  async onRunSelected(ev: Table$RowSelectionChangeEvent): Promise<void> {
    const ctx = ev.getParameter("rowContext");
    if (!ctx) return;
    try { await this.showRun(ctx.getProperty("Key") as string); }
    catch (e) { MessageBox.error((e as Error).message); }
  }

  onSimulate(): void {
    void this.request(true);
  }

  onProcess(): void {
    MessageBox.confirm("Os lançamentos contábeis dos documentos pendentes do período serão gravados. Continuar?", {
      onClose: (action: string): void => { if (action === "OK") void this.request(false); },
    });
  }

  private async request(simulation: boolean): Promise<void> {
    const p = (this.getView().getModel("params") as JSONModel).getData() as Record<string, unknown>;
    const modules: number[] = [];
    if (p.PurchaseInvoices) modules.push(MODULES.PurchaseInvoices);
    if (p.SalesInvoices) modules.push(MODULES.SalesInvoices);
    if (p.Financial) modules.push(MODULES.Financial);
    if (!p.DateFrom || !p.DateTo) { MessageBox.error("Informe o período."); return; }
    if (modules.length === 0) { MessageBox.error("Escolha ao menos um módulo."); return; }

    try {
      const run = await requestRun({
        DateFrom: p.DateFrom as string,
        DateTo: p.DateTo as string,
        BranchCode: (p.BranchCode as string) || undefined,
        Modules: modules,
        Simulation: simulation,
      });
      this.op().setProperty("/Selected", run.Key);
      await this.onRefresh();
    } catch (e) {
      MessageBox.error((e as Error).message);
    }
  }

  onExportExcel(): void {
    const items = this.op().getProperty("/Items") as unknown[];
    if (!items?.length) { MessageBox.information("Nenhum documento na execução selecionada."); return; }
    const sheet = new Spreadsheet({
      dataSource: items,
      fileName: "Contabilizacao-offline.xlsx",
      workbook: {
        context: { sheetName: "Documentos" },
        columns: [
          { label: "Seq.", property: "Sequence", type: EdmType.Number },
          { label: "Data", property: "EventDate", type: EdmType.Date, inputFormat: "yyyy-mm-dd", format: "dd/mm/yyyy" },
          { label: "Tipo", property: "DocumentTypeText" },
          { label: "Documento", property: "DocumentNumber" },
          { label: "Filial", property: "BranchCode" },
          { label: "Códigos", property: "Codes" },
          { label: "Resultado", property: "ResultText" },
          { label: "Mensagem", property: "Message", width: 60 },
          { label: "Lançamentos", property: "JournalEntryDocEntries" },
        ],
      },
    });
    void sheet.build().finally(() => sheet.destroy());
  }
}
