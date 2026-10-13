import InvoiceReportController from "../InvoiceReportController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Entregas × NF do Fornecedor (spec 2026-10-13 §8): os mesmos filtros da Conciliação Fiscal de Compras. Situação:
 * 0 Sem NF, 1 Parcial, 2 Conciliado (vazio = todas).
 * @namespace siagrob1.controller.reports.purchaseFiscalReconciliation
 */
export default class Main extends InvoiceReportController {
	protected readonly routeName = "purchaseFiscalReconciliationReport";
	protected readonly formId = "purchaseFiscalReconciliationReportForm";
	protected readonly serverRoute = ServerRoutes.purchaseFiscalReconciliationReport;

	protected defaults() {
		return { CardCode: "", CardName: "", ItemCode: "", ItemName: "", ContractCode: "", FromDate: "", ToDate: "", FiscalStatuses: [] as string[] };
	}

	/** Statuses aqui é a situação FISCAL; a de documento que a base injeta não se aplica. */
	protected buildPayload() {
		const data = super.buildPayload();
		data.Statuses = ((data.FiscalStatuses as unknown[]) ?? []).map(Number);
		delete data.FiscalStatuses;
		delete data.NfeStatuses;
		delete data.CardName;
		delete data.ItemName;
		return data;
	}
}
