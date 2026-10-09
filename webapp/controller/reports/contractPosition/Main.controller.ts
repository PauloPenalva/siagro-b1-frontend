import ContractPositionReportController from "../ContractPositionReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Contratos - Compra x Venda. Lado (ContractPositionSide): 0 Ambos, 1 Compra, 2 Venda.
 * @namespace siagrob1.controller.reports.contractPosition
 */
export default class Main extends ContractPositionReportController {
	protected readonly routeName = "contractPositionReport";
	protected readonly formId = "contractPositionReportForm";
	protected readonly serverRoute = ServerRoutes.contractPositionReport;

	protected defaults() {
		return { ...super.defaults(), Side: "0" };
	}

	protected buildPayload() {
		const data = super.buildPayload();
		data.Side = data.Side == null ? 0 : Number(data.Side);
		return data;
	}
}
