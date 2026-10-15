/**
 * Filtros crus ($filter em string) da lista de títulos: `sap.ui.model.Filter` sobre enum estoura "Unsupported type".
 */

/**
 * "Com saldo a resolver": firme ou devolução que ainda não foi toda composta, compensada ou baixada por dação.
 * Pagar (spec 2026-10-13): conciliação fiscal ou complemento de valor (D11, origem PurchaseInvoice). Receber
 * (spec 2026-10-15): documento de saída. OpenAmount é [NotMapped] e não vai ao SQL, então a comparação é pelas
 * colunas reais. A origem exclui o título a receber do washout (também Firm).
 */
export function pendingResolutionFilter(direction: "Payable" | "Receivable" = "Payable"): string {
	if (direction === "Receivable") {
		return "OriginType eq 'SalesInvoice'"
			+ " and (Nature eq 'Firm' or Nature eq 'SalesReturn')"
			+ " and Status ne 'Canceled' and NetAmount gt SettledAmount";
	}
	return "(OriginType eq 'PurchaseFiscalReconciliation' or OriginType eq 'PurchaseInvoice')"
		+ " and (Nature eq 'Firm' or Nature eq 'PurchaseReturn')"
		+ " and Status ne 'Canceled' and NetAmount gt SettledAmount";
}
