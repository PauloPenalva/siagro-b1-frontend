import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * @namespace siagrob1.controller.reports.salesInvoiceItems
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "salesInvoiceItemsReport";
	protected readonly formId = "salesInvoiceItemsReportForm";
	protected readonly serverRoute = ServerRoutes.salesInvoiceItemsReport;

	protected defaults() {
		return { InvoiceType: "", ContractCode: "", Cfop: "" };
	}

	protected buildPayload() {
		const data = super.buildPayload();
		data.InvoiceType = data.InvoiceType == null ? null : Number(data.InvoiceType);
		return data;
	}
}
