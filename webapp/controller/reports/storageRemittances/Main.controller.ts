import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Remessas para Depósito (só STANDALONE — o menu some em SAPB1). Situação de retorno:
 * 0 Todas, 1 Em aberto (A retornar > 0), 2 Totalmente retornada. Detalhado lista, abaixo de cada
 * remessa, os retornos e os romaneios de carregamento com o retorno reconciliado.
 * @namespace siagrob1.controller.reports.storageRemittances
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "storageRemittancesReport";
	protected readonly formId = "storageRemittancesReportForm";
	protected readonly serverRoute = ServerRoutes.storageRemittancesByPeriodReport;

	protected defaults() {
		return { ReturnSituation: "0", Detailed: false, CardCode: "", CardName: "" };
	}

	/** Este relatório não filtra situação do documento nem da NF-e; a situação aqui é a de retorno. */
	protected buildPayload() {
		const data = super.buildPayload();
		delete data.Statuses;
		delete data.NfeStatuses;
		delete data.CardName;
		data.ReturnSituation = Number(data.ReturnSituation ?? 0);
		data.Detailed = data.Detailed === true;
		return data;
	}
}
