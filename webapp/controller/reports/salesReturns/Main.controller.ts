import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * @namespace siagrob1.controller.reports.salesReturns
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "salesReturnsReport";
	protected readonly formId = "salesReturnsReportForm";
	protected readonly serverRoute = ServerRoutes.salesReturnsReport;

	protected defaults() {
		return { Source: "" };
	}

	protected buildPayload() {
		const data = super.buildPayload();
		// SalesReturnSource: 0 Própria, 1 Cliente.
		data.Source = data.Source == null ? null : Number(data.Source);
		return data;
	}
}
