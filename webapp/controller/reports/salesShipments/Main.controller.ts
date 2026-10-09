import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Romaneios de Venda. StorageTransactionsStatus: 0 Pendente, 1 Confirmado, 2 Cancelado,
 * 3 Faturado, 4 Devolvido — padrão sem Cancelado. "Vínculo com carga" viaja como booleano
 * (true = com carga, false = sem carga, null = ambos).
 * @namespace siagrob1.controller.reports.salesShipments
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "salesShipmentsReport";
	protected readonly formId = "salesShipmentsReportForm";
	protected readonly serverRoute = ServerRoutes.salesShipmentsByPeriodReport;

	protected defaults() {
		return { Statuses: ["0", "1", "3", "4"], HasLoad: "" };
	}

	protected buildPayload() {
		const data = super.buildPayload();
		data.HasLoad = data.HasLoad == null ? null : data.HasLoad === "true";
		return data;
	}
}
