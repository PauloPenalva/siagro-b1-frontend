import InvoiceReportController from "./InvoiceReportController";

/**
 * Base das telas de posição de contratos. Não há período: a posição é a do momento da emissão,
 * e nenhum campo é obrigatório (o validateForm do base só barra controles com required=true).
 * ContractStatus: 0 Rascunho, 1 Aprovado, 2 Finalizado, 3 Cancelado, 4 Em Aprovação, 5 Rejeitado
 * — padrão só Aprovado. ContractType: 0 FIX, 1 PAF.
 * @namespace siagrob1.controller.reports
 */
export default abstract class ContractPositionReportController extends InvoiceReportController {

	protected defaults(): Record<string, unknown> {
		return { Statuses: ["1"], Type: "" };
	}

	protected buildPayload(): Record<string, unknown> {
		const data = super.buildPayload();
		data.Type = data.Type == null ? null : Number(data.Type);
		return data;
	}
}
