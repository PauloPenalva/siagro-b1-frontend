import CommonController from "siagrob1/controller/common/CommonController";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { CatalogEntry, PostingLine, loadCatalog, loadConfigured, sourceText } from "./StandardPostingApi";

const option = (key: string) => ({ key, text: sourceText(key) });

/**
 * Sequências de um lançamento padrão (CT5). As origens de conta e valor vêm do catálogo do código; a gravação
 * (POST StandardPostings) substitui as sequências e o servidor valida tudo de novo.
 *
 * @namespace siagrob1.controller.standardPostings
 */
export default class Edit extends CommonController {
  private catalog: CatalogEntry;

  onInit(): void {
    this.getView().setModel(new JSONModel({ Lines: [] }), "lp");
    this.getRouter().getRoute("standardPostingsEdit").attachPatternMatched((ev) => void this.load(ev));
  }

  private model(): JSONModel {
    return this.getView().getModel("lp") as JSONModel;
  }

  private async load(ev: Route$MatchedEvent): Promise<void> {
    const { code } = ev.getParameter("arguments") as { code: string };
    this.setBusy(true);
    try {
      const [catalog, configured] = await Promise.all([loadCatalog(), loadConfigured()]);
      this.catalog = catalog.find((c) => c.Code === code);
      if (!this.catalog) {
        MessageBox.error(`Código ${code} não existe.`);
        return;
      }
      const posting = configured.find((p) => p.Code === code);
      this.model().setData({
        Code: code,
        Description: this.catalog.Description,
        Help: this.catalog.Help,
        Batch: this.catalog.Batch,
        PlaceholdersText: this.catalog.Placeholders.join("  "),
        Active: posting?.Active ?? true,
        AccountSources: this.catalog.AccountSources.map(option),
        ValueSources: this.catalog.ValueSources.map(option),
        Lines: (posting?.Lines ?? []).slice().sort((a, b) => a.Sequence.localeCompare(b.Sequence)),
      });
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  onAddLine(): void {
    const lines = (this.model().getProperty("/Lines") as PostingLine[]) ?? [];
    const next = String(lines.reduce((max, l) => Math.max(max, Number(l.Sequence) || 0), 0) + 1).padStart(3, "0");
    const fixed = this.catalog.AccountSources[this.catalog.AccountSources.length - 1];
    lines.push({
      Sequence: next, EntryType: "Double", DebitAccountSource: fixed, CreditAccountSource: fixed,
      ValueSource: this.catalog.ValueSources[0], HistoryTemplate: "", DebitCostCenterSource: "None",
      CreditCostCenterSource: "None", DebitItemSource: "None", CreditItemSource: "None", Active: true,
    });
    this.model().setProperty("/Lines", lines);
  }

  onRemoveLines(): void {
    const table = this.byId("standardPostingLinesTable") as Table;
    const selected = new Set(table.getSelectedIndices());
    if (selected.size === 0) {
      MessageBox.alert("Selecione as sequências a remover.");
      return;
    }
    const lines = (this.model().getProperty("/Lines") as PostingLine[]).filter((_, i) => !selected.has(i));
    table.clearSelection();
    this.model().setProperty("/Lines", lines);
  }

  openAnalyticCostCenterValueHelp(ev: Input$ValueHelpRequestEvent): void {
    void this.applyValueHelp(ev, "CostCentersSelectDialog", ["Code", "Name"], "Code",
      [new Filter("Inactive", FilterOperator.EQ, false)], undefined, "Class eq 'Analytic'");
  }

  openAnalyticAccountingItemValueHelp(ev: Input$ValueHelpRequestEvent): void {
    void this.applyValueHelp(ev, "AccountingItemsSelectDialog", ["Code", "Name"], "Code",
      [new Filter("Inactive", FilterOperator.EQ, false)], undefined, "Class eq 'Analytic'");
  }

  async onSave(): Promise<void> {
    const data = this.model().getData() as { Code: string; Active: boolean; Lines: PostingLine[] };
    const text = (v?: string) => (v?.trim() ? v.trim() : null);
    const payload = {
      Code: data.Code,
      Active: !!data.Active,
      UpdatedBy: "",
      Lines: data.Lines.map((l) => ({
        Code: data.Code,
        Sequence: l.Sequence?.trim() ?? "",
        EntryType: l.EntryType,
        DebitAccountSource: l.EntryType === "Credit" ? null : text(l.DebitAccountSource),
        DebitAccountCode: l.EntryType === "Credit" ? null : text(l.DebitAccountCode),
        CreditAccountSource: l.EntryType === "Debit" ? null : text(l.CreditAccountSource),
        CreditAccountCode: l.EntryType === "Debit" ? null : text(l.CreditAccountCode),
        ValueSource: l.ValueSource,
        HistoryTemplate: l.HistoryTemplate ?? "",
        DebitCostCenterSource: l.DebitCostCenterSource ?? "None",
        DebitCostCenterCode: text(l.DebitCostCenterCode),
        CreditCostCenterSource: l.CreditCostCenterSource ?? "None",
        CreditCostCenterCode: text(l.CreditCostCenterCode),
        DebitItemSource: l.DebitItemSource ?? "None",
        DebitItemCode: text(l.DebitItemCode),
        CreditItemSource: l.CreditItemSource ?? "None",
        CreditItemCode: text(l.CreditItemCode),
        Active: l.Active !== false,
      })),
    };

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.standardPostings, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show(`Lançamento padrão ${data.Code} gravado.`);
    } finally {
      this.setBusy(false);
    }
  }
}
