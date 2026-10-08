import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * @namespace siagrob1.controller.reports.purchaseInvoiceItems
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "purchaseInvoiceItemsReport";
	protected readonly formId = "purchaseInvoiceItemsReportForm";
	protected readonly serverRoute = ServerRoutes.purchaseInvoiceItemsReport;

	protected defaults() {
		return { InvoiceType: "", IssuerType: "", ContractCode: "", Cfop: "" };
	}

	protected buildPayload() {
		const data = super.buildPayload();
		data.InvoiceType = data.InvoiceType == null ? null : Number(data.InvoiceType);
		data.IssuerType = data.IssuerType == null ? null : Number(data.IssuerType);
		return data;
	}
}
