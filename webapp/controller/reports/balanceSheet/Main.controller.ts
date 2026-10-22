import { EdmType } from "sap/ui/export/library";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import AccountingReportController from "../AccountingReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { loadViewOptions } from "../incomeStatement/Main.controller";

/**
 * Balanço Patrimonial pela visão gerencial, na data-base (o "Até" do filtro), com comparativo opcional.
 * @namespace siagrob1.controller.reports.balanceSheet
 */
export default class Main extends AccountingReportController {
  protected routeName = "balanceSheetReport";
  protected pdfUrl = ServerRoutes.balanceSheetReport;
  protected dataUrl = ServerRoutes.balanceSheetReportData;
  protected fileName = "Balanco";
  private defaultView = "";

  onInit(): void {
    super.onInit();
    void loadViewOptions(this, "BalanceSheet").then((code) => { this.defaultView = code; });
  }

  protected request(): Record<string, unknown> {
    const p = (this.getModel("params") as JSONModel).getData() as Record<string, unknown>;
    if (!p.DateTo) { MessageBox.warning("Informe a data-base."); return null; }
    const viewCode = (p.ViewCode as string) || this.defaultView;
    if (!viewCode) { MessageBox.warning("Escolha a visão gerencial."); return null; }
    const branch = (p.BranchCode as string)?.trim();
    return { Date: p.DateTo, CompareDate: (p.CompareDate as string) || null, ViewCode: viewCode, BranchCode: branch || null };
  }

  protected excelColumns() {
    return [
      { label: "Código", property: "code" },
      { label: "Descrição", property: "description", width: 40 },
      { label: "Saldo", property: "balance", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "Comparativo", property: "compareBalance", type: EdmType.Number, scale: 2, delimiter: true },
    ];
  }
}
