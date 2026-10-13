import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Custódia de Armazenagem (só STANDALONE — o menu some em SAPB1). Situação: 0 Todas, 1 Com pendência fiscal,
 * 2 Completa. Cada romaneio de lote de terceiro sai com as etapas fiscais esperadas logo abaixo.
 * @namespace siagrob1.controller.reports.storageCustody
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "storageCustodyReport";
	protected readonly formId = "storageCustodyReportForm";
	protected readonly serverRoute = ServerRoutes.storageCustodyByPeriodReport;

	protected defaults() {
		return { Situation: "0", CardCode: "", CardName: "", StorageAddressCode: "", StorageAddressDescription: "" };
	}

	/** Este relatório não filtra situação do documento nem da NF-e; a situação aqui é a fiscal do romaneio. */
	protected buildPayload() {
		const data = super.buildPayload();
		delete data.Statuses;
		delete data.NfeStatuses;
		delete data.CardName;
		delete data.StorageAddressDescription;
		data.Situation = Number(data.Situation ?? 0);
		return data;
	}
}
