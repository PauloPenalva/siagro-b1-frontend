import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Cargas por Período. Situação padrão: todas menos Cancelada (3).
 * ShipmentLoadStatus: 0 Carregada, 1 Faturada Parcial, 2 Faturada, 3 Cancelada, 4 Planejada,
 * 5 Devolvida, 6 Concluída, 7 Em Transbordo, 8 Descarregada. LoadType: 0 Normal, 1 Remoção.
 * @namespace siagrob1.controller.reports.shipmentLoads
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "shipmentLoadsReport";
	protected readonly formId = "shipmentLoadsReportForm";
	protected readonly serverRoute = ServerRoutes.shipmentLoadsByPeriodReport;

	protected defaults() {
		return { Statuses: ["4", "0", "1", "2", "7", "8", "6", "5"], LoadType: "" };
	}

	protected buildPayload() {
		const data = super.buildPayload();
		data.LoadType = data.LoadType == null ? null : Number(data.LoadType);
		return data;
	}
}
