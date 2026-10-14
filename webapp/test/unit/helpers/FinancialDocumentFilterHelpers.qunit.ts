import { pendingResolutionFilter } from "siagrob1/helpers/FinancialDocumentFilterHelpers";

QUnit.module("FinancialDocumentFilterHelpers - Com saldo a resolver");

QUnit.test("firme e devolução da conciliação, não cancelados, com saldo pelas colunas reais", function (assert) {
	assert.strictEqual(
		pendingResolutionFilter(),
		"(OriginType eq 'PurchaseFiscalReconciliation' or OriginType eq 'PurchaseInvoice')"
		+ " and (Nature eq 'Firm' or Nature eq 'PurchaseReturn')"
		+ " and Status ne 'Canceled' and NetAmount gt SettledAmount");
});
