import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import TextArea from "sap/m/TextArea";
import Button from "sap/m/Button";
import type { Button$PressEvent } from "sap/m/Button";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  odataString, pascalKeys, reinfBatchStatusText, reinfEventStatusState, reinfEventStatusText, reinfPendingBatchKeys,
  reinfPeriodActions, reinfPeriodStatusText, reinfSituationState,
} from "siagrob1/helpers/ReinfHelpers";

type Contributor = { TaxIdRoot: string; Name: string; HasSettings: boolean };
type Row = Record<string, unknown> & { Situation?: string };
type EventRow = Record<string, unknown> & { BatchKey?: string; BatchStatus?: string; Status?: string; Xml?: string };

/**
 * EFD-Reinf (só STANDALONE): apuração do R-2055 por raiz de CNPJ e mês, transmissão, consulta de lotes,
 * fechamento (R-2099) e reabertura (R-2098).
 *
 * @namespace siagrob1.controller.reinf
 */
export default class Main extends CommonController {
  formatSituationState = reinfSituationState;
  formatEventStatusText = reinfEventStatusText;
  formatEventStatusState = reinfEventStatusState;
  formatBatchStatusText = reinfBatchStatusText;

  private xmlDialog: Dialog;

  onInit(): void {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    this.getView().setModel(new JSONModel({
      TaxIdRoot: "", Period: period, Loaded: false, PeriodStatus: "", PeriodStatusText: "", ClosingReceipt: "",
      Rows: [], Issues: [], IssuesText: "", Events: [], CanTransmit: false, CanClose: false, CanReopen: false,
    }), "reinf");
    this.getView().setModel(new JSONModel({ items: [] }), "contributors");
    this.getRouter().getRoute("reinf")?.attachPatternMatched(() => void this.loadContributors());
  }

  private model(): JSONModel {
    return this.getView().getModel("reinf") as JSONModel;
  }

  private async loadContributors(): Promise<void> {
    const result = await sendJson("GET", ServerRoutes.reinfContributors);
    if (!result.ok) {
      MessageBox.error(result.message ?? "Erro ao carregar os contribuintes.");
      return;
    }
    const items = odataCollection<unknown>(result.data).map((c) => pascalKeys<Contributor>(c));
    (this.getView().getModel("contributors") as JSONModel).setData({ items });
    if (!this.model().getProperty("/TaxIdRoot") && items.length === 1) this.model().setProperty("/TaxIdRoot", items[0].TaxIdRoot);
  }

  private filters(): { root: string; period: string } {
    const root = (this.model().getProperty("/TaxIdRoot") as string) ?? "";
    const period = (this.model().getProperty("/Period") as string) ?? "";
    if (!root || !/^\d{4}-\d{2}$/.test(period)) {
      MessageBox.warning("Informe o contribuinte e o mês.");
      return undefined;
    }
    return { root, period };
  }

  onFilterChange(): void {
    this.model().setProperty("/Loaded", false);
    this.applyActions();
  }

  async onCalculate(): Promise<void> {
    const f = this.filters();
    if (!f) return;
    this.setBusy(true);
    try {
      await this.reload(f.root, f.period);
    } finally {
      this.setBusy(false);
    }
  }

  /** Recarrega visão do período e eventos (depois de cada ação). */
  private async reload(root: string, period: string): Promise<void> {
    const args = `(taxIdRoot=${odataString(root)},period=${odataString(period)})`;
    const [overview, events] = await Promise.all([
      sendJson("GET", `${ServerRoutes.reinfOverview}${args}`),
      sendJson("GET", `${ServerRoutes.reinfEvents}${args}`),
    ]);
    if (!overview.ok) {
      MessageBox.error(overview.message ?? "Erro ao apurar o período.");
      return;
    }
    const o = pascalKeys<Record<string, unknown>>(odataValue<unknown>(overview.data));
    const rows = ((o.Rows as unknown[]) ?? []).map((r) => pascalKeys<Row>(r));
    const issues = ((o.Issues as unknown[]) ?? []).map((i) => pascalKeys<{ Message: string; Reference?: string }>(i));
    const m = this.model();
    m.setProperty("/Rows", rows);
    m.setProperty("/Issues", issues);
    m.setProperty("/IssuesText", issues.map((i) => (i.Reference ? `${i.Reference}: ${i.Message}` : i.Message)).join("\n"));
    m.setProperty("/PeriodStatus", (o.PeriodStatus as string) || "Open");
    m.setProperty("/PeriodStatusText", reinfPeriodStatusText(o.PeriodStatus as string));
    m.setProperty("/ClosingReceipt", (o.ClosingReceipt as string) ?? "");
    m.setProperty("/Events", events.ok ? odataCollection<unknown>(events.data).map((e) => pascalKeys<EventRow>(e)) : []);
    if (!events.ok) MessageBox.error(events.message ?? "Erro ao carregar os eventos.");
    m.setProperty("/Loaded", true);
    this.applyActions();
  }

  private applyActions(): void {
    const m = this.model();
    const loaded = m.getProperty("/Loaded") as boolean;
    const a = reinfPeriodActions(m.getProperty("/PeriodStatus") as string, ((m.getProperty("/Rows") as Row[]) ?? []).length > 0);
    m.setProperty("/CanTransmit", loaded && a.canTransmit);
    m.setProperty("/CanClose", loaded && a.canClose);
    m.setProperty("/CanReopen", loaded && a.canReopen);
  }

  private async periodAction(url: string, success: string, failure: string): Promise<void> {
    const f = this.filters();
    if (!f) return;
    this.setBusy(true);
    try {
      const result = await sendJson("POST", url, { TaxIdRoot: f.root, Period: f.period });
      if (!result.ok) MessageBox.error(result.message ?? failure);
      else MessageToast.show(success);
      await this.reload(f.root, f.period);
    } finally {
      this.setBusy(false);
    }
  }

  onTransmit(): void {
    MessageBox.confirm("Transmitir os eventos R-2055 pendentes do período?", {
      onClose: (action: string) => {
        if (action === MessageBox.Action.OK.toString()) void this.periodAction(ServerRoutes.reinfTransmit, "Eventos transmitidos.", "Erro ao transmitir.");
      },
    });
  }

  onClosePeriod(): void {
    MessageBox.confirm("Fechar o período (R-2099)?", {
      onClose: (action: string) => {
        if (action === MessageBox.Action.OK.toString()) void this.periodAction(ServerRoutes.reinfClose, "Fechamento enviado.", "Erro ao fechar o período.");
      },
    });
  }

  onReopen(): void {
    MessageBox.confirm("Reabrir o período (R-2098)?", {
      onClose: (action: string) => {
        if (action === MessageBox.Action.OK.toString()) void this.periodAction(ServerRoutes.reinfReopen, "Reabertura enviada.", "Erro ao reabrir o período.");
      },
    });
  }

  /** Consulta cada lote ainda Enviado/Em processamento. */
  async onQueryBatches(): Promise<void> {
    const f = this.filters();
    if (!f) return;
    const keys = reinfPendingBatchKeys((this.model().getProperty("/Events") as EventRow[]) ?? []);
    if (keys.length === 0) {
      MessageToast.show("Nenhum lote pendente de consulta.");
      return;
    }
    this.setBusy(true);
    try {
      const errors: string[] = [];
      for (const key of keys) {
        const result = await sendJson("POST", ServerRoutes.reinfBatchQuery, { BatchKey: key });
        if (!result.ok) errors.push(result.message ?? `Erro ao consultar o lote ${key}.`);
      }
      if (errors.length) MessageBox.error(errors.join("\n"));
      else MessageToast.show(`${keys.length} lote(s) consultado(s).`);
      await this.reload(f.root, f.period);
    } finally {
      this.setBusy(false);
    }
  }

  onShowEventXml(event: Button$PressEvent): void {
    const row = event.getSource().getBindingContext("reinf")?.getObject() as EventRow;
    this.showXml("XML do evento", row?.Xml ?? "");
  }

  async onShowBatchXml(event: Button$PressEvent): Promise<void> {
    const row = event.getSource().getBindingContext("reinf")?.getObject() as EventRow;
    if (!row?.BatchKey) return;
    this.setBusy(true);
    try {
      const result = await sendJson("GET", `${ServerRoutes.reinfBatchXml}(batchKey=${row.BatchKey})`);
      if (!result.ok) {
        MessageBox.error(result.message ?? "Erro ao carregar o lote.");
        return;
      }
      const b = pascalKeys<{ RequestXml: string; ResponseXml?: string; Error?: string }>(odataValue<unknown>(result.data));
      const text = `<!-- Envio -->\n${b.RequestXml ?? ""}\n\n<!-- Retorno -->\n${b.ResponseXml ?? ""}${b.Error ? `\n\n<!-- Erro -->\n${b.Error}` : ""}`;
      this.showXml("XML do lote", text);
    } finally {
      this.setBusy(false);
    }
  }

  private showXml(title: string, text: string): void {
    if (!this.xmlDialog) {
      this.xmlDialog = new Dialog({
        contentWidth: "60rem",
        contentHeight: "70%",
        resizable: true,
        draggable: true,
        content: [new TextArea({ editable: false, width: "100%", rows: 30, growing: false })],
        endButton: new Button({ text: "Fechar", press: () => this.xmlDialog.close() }),
      });
      this.getView().addDependent(this.xmlDialog);
    }
    this.xmlDialog.setTitle(title);
    (this.xmlDialog.getContent()[0] as TextArea).setValue(text);
    this.xmlDialog.open();
  }

  onSettings(): void {
    this.getRouter().navTo("reinfSettings");
  }
}
