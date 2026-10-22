import { EdmType } from "sap/ui/export/library";
import JSONModel from "sap/ui/model/json/JSONModel";
import AccountingReportController from "../AccountingReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Diário: lançamentos do período com termos de abertura e encerramento; folha inicial e número do livro informados.
 * @namespace siagrob1.controller.reports.accountingJournal
 */
export default class Main extends AccountingReportController {
  protected routeName = "accountingJournalReport";
  protected pdfUrl = ServerRoutes.accountingJournalReport;
  protected dataUrl = ServerRoutes.accountingJournalReportData;
  protected fileName = "Diario";

  protected request(): Record<string, unknown> {
    const base = super.request();
    if (!base) return null;
    const p = (this.getModel("params") as JSONModel).getData() as Record<string, unknown>;
    return {
      DateFrom: base.DateFrom, DateTo: base.DateTo, BranchCode: base.BranchCode,
      StartPage: Number(p.StartPage) > 0 ? Number(p.StartPage) : 1, BookNumber: Number(p.BookNumber) > 0 ? Number(p.BookNumber) : 1,
    };
  }

  protected excelColumns() {
    return [
      { label: "Data", property: "date", type: EdmType.Date, format: "dd/mm/yyyy" },
      { label: "Lote", property: "batch" },
      { label: "Documento", property: "documentNumber" },
      { label: "Linha", property: "lineNumber", type: EdmType.Number },
      { label: "Filial", property: "branchCode" },
      { label: "Conta", property: "account" },
      { label: "Descrição", property: "accountName", width: 30 },
      { label: "Débito", property: "debit", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "Crédito", property: "credit", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "Histórico", property: "history", width: 40 },
      { label: "Centro de custo", property: "costCenter" },
      { label: "Item contábil", property: "item" },
    ];
  }
}
