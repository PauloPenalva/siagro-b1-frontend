import ContractPositionReportController from "../ContractPositionReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Posição Comprado x Vendido por Mês. Mesmos filtros da base, sem Lado (os dois sempre).
 * @namespace siagrob1.controller.reports.contractMonthlyPosition
 */
export default class Main extends ContractPositionReportController {
	protected readonly routeName = "contractMonthlyPositionReport";
	protected readonly formId = "contractMonthlyPositionReportForm";
	protected readonly serverRoute = ServerRoutes.contractMonthlyPositionReport;
}
