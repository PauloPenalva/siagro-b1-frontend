import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Liberações de Compra. ReleaseStatus: 0 Pendente, 1 Ativo, 2 Finalizado, 3 Cancelado,
 * 4 Pausado — padrão sem Cancelado. ReleaseOrigin: 0 Compra, 1 Transferência, 2 Devolução,
 * 3 Transbordo.
 * @namespace siagrob1.controller.reports.shipmentReleases
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "shipmentReleasesReport";
	protected readonly formId = "shipmentReleasesReportForm";
	protected readonly serverRoute = ServerRoutes.shipmentReleasesByPeriodReport;

	protected defaults() {
		return { Statuses: ["0", "1", "2", "4"], ContractCode: "", Origin: "" };
	}

	protected buildPayload() {
		const data = super.buildPayload();
		data.Origin = data.Origin == null ? null : Number(data.Origin);
		return data;
	}
}
