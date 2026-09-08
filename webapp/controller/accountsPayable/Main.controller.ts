import { SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { FinancialDocumentsBaseController } from "siagrob1/controller/financialDocuments/FinancialDocumentsBaseController";

/**
 * Contas a Pagar — subclasse magra, só fixa a identidade da tela.
 *
 * @namespace siagrob1.controller.accountsPayable
 */
export default class Main extends FinancialDocumentsBaseController {
  formatter = { ...formatter }

  protected get tableId(): string { return "accountsPayableTable"; }
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected get direction(): "Payable" | "Receivable" | null { return "Payable"; }
  /** Adiantamento tem tela propria; esta lista mostra provisorio e (na Fase 2) firme. */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected get natureFilter(): string | null { return "Nature ne 'Advance'"; }
  protected get originRoute(): string { return "accountsPayable"; }

  onInit(): void {
    this.createFilterModel();

    this.getRouter().getRoute("accountsPayable")
      .attachPatternMatched(() => this.onRouteMatched());
  }

  onExcel(): void {
    const table = this.byId(this.tableId) as Table;
    const binding = table.getBinding("rows") as ODataListBinding;

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: "Contas a pagar.xlsx",
      workbook: {
        columns: this.orderExportColumns(table, this.createColumnConfig()),
        hierarchyLevel: "Level",
        context: { sheetName: "Contas a pagar" },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () { oSheet.destroy(); });
  }
}
