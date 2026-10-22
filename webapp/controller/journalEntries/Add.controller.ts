import CommonController from "siagrob1/controller/common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { formatMoney, isCreditSide, isDebitSide } from "./JournalEntryFormat";

type DraftLine = {
  EntryType: "Debit" | "Credit" | "Double";
  DebitAccountCode: string;
  CreditAccountCode: string;
  Amount: number;
  History: string;
  DebitCostCenterCode: string;
  CreditCostCenterCode: string;
  DebitAccountingItemCode: string;
  CreditAccountingItemCode: string;
};

type Draft = {
  PostingDate: string;
  BranchCode: string;
  Batch: string;
  Comments: string;
  Lines: DraftLine[];
  TotalDebit: number;
  TotalCredit: number;
  Difference: number;
  CanSave: boolean;
};

const emptyLine = (): DraftLine => ({
  EntryType: "Double", DebitAccountCode: "", CreditAccountCode: "", Amount: 0, History: "",
  DebitCostCenterCode: "", CreditCostCenterCode: "", DebitAccountingItemCode: "", CreditAccountingItemCode: "",
});

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Inclusão manual de lançamento contábil (CTBA102). O rodapé mostra débito, crédito e diferença; Gravar só
 * habilita com diferença zero. A validação definitiva (contas, CC/Item, período) é do servidor.
 *
 * @namespace siagrob1.controller.journalEntries
 */
export default class Add extends CommonController {
  formatMoney = (v: number) => formatMoney(v) || "0,00";

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "entry");
    this.getRouter().getRoute("journalEntriesNew").attachPatternMatched(() => void this.reset());
  }

  private model(): JSONModel {
    return this.getView().getModel("entry") as JSONModel;
  }

  private async reset(): Promise<void> {
    const branch = await this.getBranchInfo();
    this.model().setData({
      PostingDate: localIsoDate(new Date()), BranchCode: branch?.code ?? "", Batch: "008890", Comments: "",
      Lines: [emptyLine(), emptyLine()], TotalDebit: 0, TotalCredit: 0, Difference: 0, CanSave: false,
    } as Draft);
    this.onLineChange();
  }

  /** Recalcula totais e a liberação do Gravar (centavos arredondados, como o servidor compara). */
  onLineChange(): void {
    const data = this.model().getData() as Draft;
    const lines = data.Lines ?? [];
    const debit = round2(lines.filter((l) => isDebitSide(l.EntryType)).reduce((s, l) => s + Number(l.Amount || 0), 0));
    const credit = round2(lines.filter((l) => isCreditSide(l.EntryType)).reduce((s, l) => s + Number(l.Amount || 0), 0));
    this.model().setProperty("/TotalDebit", debit);
    this.model().setProperty("/TotalCredit", credit);
    this.model().setProperty("/Difference", round2(debit - credit));
    this.model().setProperty("/CanSave", lines.length > 0 && debit > 0 && debit === credit);
  }

  onAddLine(): void {
    const lines = [...((this.model().getProperty("/Lines") as DraftLine[]) ?? []), emptyLine()];
    this.model().setProperty("/Lines", lines);
  }

  onRemoveLines(): void {
    const table = this.byId("journalEntryLinesEditTable") as Table;
    const selected = new Set(table.getSelectedIndices());
    if (selected.size === 0) {
      MessageBox.alert("Selecione as linhas a remover.");
      return;
    }
    const lines = (this.model().getProperty("/Lines") as DraftLine[]).filter((_, i) => !selected.has(i));
    table.clearSelection();
    this.model().setProperty("/Lines", lines);
    this.onLineChange();
  }

  openCostCenterValueHelp(ev: Input$ValueHelpRequestEvent): void {
    void this.applyValueHelp(ev, "CostCentersSelectDialog", ["Code", "Name"], "Code",
      [new Filter("Inactive", FilterOperator.EQ, false)], undefined, "Class eq 'Analytic'");
  }

  openAccountingItemValueHelp(ev: Input$ValueHelpRequestEvent): void {
    void this.applyValueHelp(ev, "AccountingItemsSelectDialog", ["Code", "Name"], "Code",
      [new Filter("Inactive", FilterOperator.EQ, false)], undefined, "Class eq 'Analytic'");
  }

  async onSave(): Promise<void> {
    this.onLineChange();
    const data = this.model().getData() as Draft;
    if (!data.PostingDate || !data.BranchCode) {
      MessageBox.warning("Informe a data e a filial.");
      return;
    }
    if (!data.CanSave) {
      MessageBox.warning("O lançamento precisa estar balanceado (débito = crédito).");
      return;
    }

    const text = (v: string) => (v?.trim() ? v.trim() : null);
    const payload = {
      // Meio-dia UTC: o servidor usa só a data, e o dia não muda em nenhum fuso do Brasil.
      PostingDate: `${data.PostingDate}T12:00:00Z`,
      BranchCode: data.BranchCode,
      Batch: data.Batch?.trim() ?? "",
      SubBatch: "001",
      DocumentNumber: "",
      Origin: "Manual",
      CreatedBy: "",
      Comments: text(data.Comments),
      Lines: data.Lines.map((l, i) => ({
        LineNumber: i + 1,
        EntryType: l.EntryType,
        DebitAccountCode: l.EntryType === "Credit" ? null : text(l.DebitAccountCode),
        CreditAccountCode: l.EntryType === "Debit" ? null : text(l.CreditAccountCode),
        Amount: round2(Number(l.Amount || 0)),
        History: l.History ?? "",
        DebitCostCenterCode: l.EntryType === "Credit" ? null : text(l.DebitCostCenterCode),
        CreditCostCenterCode: l.EntryType === "Debit" ? null : text(l.CreditCostCenterCode),
        DebitAccountingItemCode: l.EntryType === "Credit" ? null : text(l.DebitAccountingItemCode),
        CreditAccountingItemCode: l.EntryType === "Debit" ? null : text(l.CreditAccountingItemCode),
      })),
    };

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.journalEntries, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      const created = odataValue<{ DocEntry: number; Batch: string; DocumentNumber: string }>(result.data);
      MessageToast.show(`Lançamento ${created?.Batch}/${created?.DocumentNumber} gravado.`, { closeOnBrowserNavigation: false });
      this.navTo("journalEntriesDetail", { id: String(created?.DocEntry) });
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    this.onNavBack();
  }
}
