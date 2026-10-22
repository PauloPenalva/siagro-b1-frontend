import { EdmType } from "sap/ui/export/library";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import AccountingReportController from "../AccountingReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { ViewType, loadViews } from "siagrob1/controller/managementViews/ManagementViewApi";

/** Carrega as visões do tipo no modelo "views" e devolve o código da primeira (padrão do filtro). */
export async function loadViewOptions(controller: AccountingReportController, type: ViewType): Promise<string> {
  try {
    const views = (await loadViews()).filter((v) => v.Type === type).map((v) => ({ Code: v.Code, Name: `${v.Code} - ${v.Name}` }));
    controller.getView().setModel(new JSONModel({ Items: views }), "views");
    return views[0]?.Code ?? "";
  } catch (e) {
    MessageBox.error((e as Error).message);
    return "";
  }
}

/**
 * DRE pela visão gerencial: período, acumulado no ano, % sobre a receita e, no Excel, colunas por centro de custo.
 * @namespace siagrob1.controller.reports.incomeStatement
 */
export default class Main extends AccountingReportController {
  protected routeName = "incomeStatementReport";
  protected pdfUrl = ServerRoutes.incomeStatementReport;
  protected dataUrl = ServerRoutes.incomeStatementReportData;
  protected fileName = "DRE";
  private defaultView = "";
  private centers: string[] = [];

  onInit(): void {
    super.onInit();
    void loadViewOptions(this, "IncomeStatement").then((code) => { this.defaultView = code; });
  }

  protected request(): Record<string, unknown> {
    const base = super.request();
    if (!base) return null;
    const p = (this.getModel("params") as JSONModel).getData() as Record<string, unknown>;
    const viewCode = (p.ViewCode as string) || this.defaultView;
    if (!viewCode) { MessageBox.warning("Escolha a visão gerencial."); return null; }
    return { DateFrom: base.DateFrom, DateTo: base.DateTo, BranchCode: base.BranchCode, ViewCode: viewCode, ByCostCenter: !!p.ByCostCenter };
  }

  async onExportExcel(): Promise<void> {
    // As colunas por CC dependem dos dados: achata o dicionário antes de montar a planilha.
    const original = this.rowsTransform;
    this.rowsTransform = (rows) => {
      const set = new Set<string>();
      rows.forEach((r) => Object.keys((r.byCostCenter as Record<string, number>) ?? {}).forEach((k) => set.add(k)));
      this.centers = [...set];
      return rows.map((r) => {
        const flat: Record<string, unknown> = { ...r };
        this.centers.forEach((c, i) => { flat[`cc${i}`] = (r.byCostCenter as Record<string, number>)?.[c] ?? 0; });
        return flat;
      });
    };
    try { await super.onExportExcel(); } finally { this.rowsTransform = original; }
  }

  protected excelColumns() {
    return [
      { label: "Código", property: "code" },
      { label: "Descrição", property: "description", width: 40 },
      { label: "Período", property: "period", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "% Receita", property: "percentOfRevenue", type: EdmType.Number, scale: 2 },
      { label: "Acumulado no ano", property: "yearToDate", type: EdmType.Number, scale: 2, delimiter: true },
      ...this.centers.map((c, i) => ({ label: c, property: `cc${i}`, type: EdmType.Number, scale: 2, delimiter: true })),
    ];
  }
}
