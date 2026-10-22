import { EdmType } from "sap/ui/export/library";
import AccountingReportController from "../AccountingReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Balancete de verificação: saldo anterior, débito, crédito e saldo atual por conta, sintéticas somando as inferiores.
 * @namespace siagrob1.controller.reports.accountingTrialBalance
 */
export default class Main extends AccountingReportController {
  protected routeName = "accountingTrialBalanceReport";
  protected pdfUrl = ServerRoutes.accountingTrialBalanceReport;
  protected dataUrl = ServerRoutes.accountingTrialBalanceReportData;
  protected fileName = "Balancete";

  protected excelColumns() {
    return [
      { label: "Conta", property: "accountCode" },
      { label: "Descrição", property: "accountName", width: 35 },
      { label: "Nível", property: "level", type: EdmType.Number },
      { label: "Saldo anterior", property: "opening", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "D/C", property: "openingSide" },
      { label: "Débito", property: "debit", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "Crédito", property: "credit", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "Saldo atual", property: "closing", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "D/C", property: "closingSide" },
    ];
  }
}
