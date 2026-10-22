import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import CommonController from "siagrob1/controller/common/CommonController";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { monthRange } from "siagrob1/helpers/FinancialAccountMovementHelpers";

export type AccountingReportParams = {
  DateFrom: string;
  DateTo: string;
  BranchCode: string;
  AccountFrom: string;
  AccountTo: string;
  CostCenterCode: string;
  AccountingItemCode: string;
  Level?: number;
  OnlyWithMovement?: boolean;
};

type ExcelColumn = ConstructorParameters<typeof Spreadsheet>[0]["workbook"]["columns"][number];

/**
 * Base das telas de relatório contábil (Razão, Balancete): filtros comuns, PDF no endpoint do relatório e Excel
 * montado no cliente a partir das linhas que o endpoint /data devolve.
 *
 * @namespace siagrob1.controller.reports
 */
export default abstract class AccountingReportController extends CommonController {
  protected abstract routeName: string;
  protected abstract pdfUrl: string;
  protected abstract dataUrl: string;
  protected abstract fileName: string;
  protected abstract excelColumns(): ExcelColumn[];

  onInit(): void {
    this.getView().setModel(new JSONModel(), "params");
    this.getRouter().getRoute(this.routeName).attachPatternMatched(() => {
      const params = this.getModel("params") as JSONModel;
      if (params.getProperty("/DateFrom")) return; // mantém o que o usuário já escolheu
      const { from, to } = monthRange(new Date());
      params.setData({
        DateFrom: from, DateTo: to, BranchCode: "", AccountFrom: "", AccountTo: "", CostCenterCode: "",
        AccountingItemCode: "", Level: null, OnlyWithMovement: false,
      });
    });
  }

  openCostCenterFilterValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "CostCentersSelectDialog", ["Code", "Name"], "Code",
      [new Filter("Inactive", FilterOperator.EQ, false)]);
  }

  openAccountingItemFilterValueHelp(ev: Input$ValueHelpRequestEvent) {
    void this.applyValueHelp(ev, "AccountingItemsSelectDialog", ["Code", "Name"], "Code",
      [new Filter("Inactive", FilterOperator.EQ, false)]);
  }

  /** Corpo do pedido: campos vazios viram nulos; nível só quando informado. */
  protected request(): Record<string, unknown> {
    const p = (this.getModel("params") as JSONModel).getData() as AccountingReportParams;
    if (!p.DateFrom || !p.DateTo) {
      MessageBox.warning("Informe o período.");
      return null;
    }
    if (p.DateFrom > p.DateTo) {
      MessageBox.warning("A data inicial deve ser menor ou igual à final.");
      return null;
    }
    const text = (v: string) => (v?.trim() ? v.trim() : null);
    return {
      DateFrom: p.DateFrom, DateTo: p.DateTo, BranchCode: text(p.BranchCode), AccountFrom: text(p.AccountFrom),
      AccountTo: text(p.AccountTo), CostCenterCode: text(p.CostCenterCode),
      AccountingItemCode: text(p.AccountingItemCode),
      Level: Number(p.Level) > 0 ? Number(p.Level) : null, OnlyWithMovement: !!p.OnlyWithMovement,
    };
  }

  async onPrintReport(): Promise<void> {
    const body = this.request();
    if (!body) return;
    try {
      this.setBusy(true);
      await openPdfReport(this.pdfUrl, body);
    } catch (error) {
      MessageBox.error((error as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  async onExportExcel(): Promise<void> {
    const body = this.request();
    if (!body) return;
    this.setBusy(true);
    try {
      const result = await sendJson("POST", this.dataUrl, body);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      const rows = (result.data as object[]) ?? [];
      if (rows.length === 0) {
        MessageBox.information("Nenhum lançamento no período.");
        return;
      }
      const sheet = new Spreadsheet({
        dataSource: rows,
        fileName: `${this.fileName}.xlsx`,
        workbook: { context: { sheetName: this.fileName }, columns: this.excelColumns() },
      });
      void sheet.build().finally(() => sheet.destroy());
    } finally {
      this.setBusy(false);
    }
  }
}
