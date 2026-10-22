import { EdmType } from "sap/ui/export/library";
import AccountingReportController from "../AccountingReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Razão contábil: saldo anterior e partidas do período por conta, com saldo corrente D/C.
 * @namespace siagrob1.controller.reports.accountingLedger
 */
export default class Main extends AccountingReportController {
  protected routeName = "accountingLedgerReport";
  protected pdfUrl = ServerRoutes.accountingLedgerReport;
  protected dataUrl = ServerRoutes.accountingLedgerReportData;
  protected fileName = "Razao";

  protected excelColumns() {
    return [
      { label: "Conta", property: "accountCode" },
      { label: "Descrição", property: "accountName", width: 30 },
      { label: "Data", property: "date" },
      { label: "Lote/Doc", property: "document" },
      { label: "Filial", property: "branchCode" },
      { label: "Histórico", property: "history", width: 40 },
      { label: "Contrapartida", property: "counterpart" },
      { label: "Centro de custo", property: "costCenterCode" },
      { label: "Débito", property: "debit", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "Crédito", property: "credit", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "Saldo", property: "balance", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "D/C", property: "balanceSide" },
    ];
  }
}
