import { SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { FinancialDocumentsBaseController } from "siagrob1/controller/financialDocuments/FinancialDocumentsBaseController";

/**
 * Contas a Receber — subclasse magra, só fixa a identidade da tela.
 *
 * @namespace siagrob1.controller.accountsReceivable
 */
export default class Main extends FinancialDocumentsBaseController {
  formatter = { ...formatter }

  protected get tableId(): string { return "accountsReceivableTable"; }
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected get direction(): "Payable" | "Receivable" | null { return "Receivable"; }
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected get natureFilter(): string | null { return "Nature ne 'Advance'"; }
  protected get originRoute(): string { return "accountsReceivable"; }

  onInit(): void {
    this.createFilterModel();

    this.getRouter().getRoute("accountsReceivable")
      .attachPatternMatched(() => this.onRouteMatched());
  }

  onExcel(): void {
    const table = this.byId(this.tableId) as Table;
    const binding = table.getBinding("rows") as ODataListBinding;

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: "Contas a receber.xlsx",
      workbook: {
        columns: this.orderExportColumns(table, this.createColumnConfig()),
        hierarchyLevel: "Level",
        context: { sheetName: "Contas a receber" },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () { oSheet.destroy(); });
  }
}
