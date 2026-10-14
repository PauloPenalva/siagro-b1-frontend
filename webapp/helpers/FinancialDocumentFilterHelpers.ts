/**
 * Filtros crus ($filter em string) da lista de títulos: `sap.ui.model.Filter` sobre enum estoura "Unsupported type".
 */

/**
 * "Com saldo a resolver" (spec 2026-10-13, títulos firmes): firme ou devolução da Conciliação Fiscal ou firme do
 * complemento de valor (D11, origem PurchaseInvoice), não cancelado,
 * que ainda não foi todo composto, compensado ou baixado por dação. OpenAmount é [NotMapped] e não vai ao SQL — a
 * comparação é pelas colunas reais. A origem exclui o título a receber do washout (também Firm).
 */
export function pendingResolutionFilter(): string {
	return "(OriginType eq 'PurchaseFiscalReconciliation' or OriginType eq 'PurchaseInvoice')"
		+ " and (Nature eq 'Firm' or Nature eq 'PurchaseReturn')"
		+ " and Status ne 'Canceled' and NetAmount gt SettledAmount";
}
