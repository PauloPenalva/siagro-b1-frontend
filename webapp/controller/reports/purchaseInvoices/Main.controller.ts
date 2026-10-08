import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * @namespace siagrob1.controller.reports.purchaseInvoices
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "purchaseInvoicesReport";
	protected readonly formId = "purchaseInvoicesReportForm";
	protected readonly serverRoute = ServerRoutes.purchaseInvoicesByPeriodReport;

	protected defaults() {
		return { InvoiceType: "", IssuerType: "" };
	}

	protected buildPayload() {
		const data = super.buildPayload();
		data.InvoiceType = data.InvoiceType == null ? null : Number(data.InvoiceType);
		data.IssuerType = data.IssuerType == null ? null : Number(data.IssuerType);
		return data;
	}
}
