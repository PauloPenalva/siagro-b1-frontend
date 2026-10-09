import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Liberações de Venda. ReleaseStatus: 0 Pendente, 1 Ativo, 2 Finalizado, 3 Cancelado,
 * 4 Pausado — padrão sem Cancelado. Vendedor = AgentCode (inteiro) do contrato.
 * @namespace siagrob1.controller.reports.salesShipmentReleases
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "salesShipmentReleasesReport";
	protected readonly formId = "salesShipmentReleasesReportForm";
	protected readonly serverRoute = ServerRoutes.salesShipmentReleasesByPeriodReport;

	protected defaults() {
		return { Statuses: ["0", "1", "2", "4"], ContractCode: "", AgentCode: "" };
	}

	protected buildPayload() {
		const data = super.buildPayload();
		data.AgentCode = data.AgentCode == null ? null : Number(data.AgentCode);
		return data;
	}
}
