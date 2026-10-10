import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Funrural (INSS, GILRAT e SENAR) retido por item de Documento de Entrada, com as devoluções de
 * compra abatidas na linha de origem.
 * @namespace siagrob1.controller.reports.funruralWithholding
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "funruralWithholdingReport";
	protected readonly formId = "funruralWithholdingReportForm";
	protected readonly serverRoute = ServerRoutes.funruralWithholdingReport;

	protected defaults() {
		return { ContractCode: "" };
	}
}
