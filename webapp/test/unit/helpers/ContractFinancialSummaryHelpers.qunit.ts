import { contractFinancialSummary, visibleContractFinancialRows } from "siagrob1/helpers/ContractFinancialSummaryHelpers";
import { FinancialDocumentByContract } from "siagrob1/types/FinancialDocumentByContract";

QUnit.module("ContractFinancialSummaryHelpers - resumo financeiro do contrato");

function row(p: Partial<FinancialDocumentByContract>): FinancialDocumentByContract {
	return {
		Key: "k", Code: "c", Nature: "Firm", Status: "Open", DueDate: "",
		NetAmount: 0, SettledAmount: 0, OpenAmount: 0, ComposedAmount: 0,
		AppliedAmount: 0, AvailableAdvanceAmount: 0, StorageTransactionCode: "", TaxDocumentNumber: "",
		...p
	};
}

QUnit.test("sem títulos tudo zero", function (assert) {
	const s = contractFinancialSummary([]);
	assert.strictEqual(s.Balance, 0);
	assert.strictEqual(s.TitlesAmount, 0);
	assert.strictEqual(s.HasRows, false);
});

QUnit.test("só firmes entram; provisório (aglutinador) e cancelado ficam fora", function (assert) {
	const s = contractFinancialSummary([
		row({ Nature: "Provisional", NetAmount: "1000.50", OpenAmount: "1000.50" }),
		row({ Nature: "Firm", NetAmount: "500.25", SettledAmount: 200, OpenAmount: "300.25" }),
		row({ Nature: "Firm", Status: "Canceled", NetAmount: 999, OpenAmount: 999 })
	]);
	assert.strictEqual(s.TitlesAmount, 500.25);
	assert.strictEqual(s.SettledAmount, 200);
	assert.strictEqual(s.OpenAmount, 300.25);
	assert.strictEqual(s.Balance, 300.25);
});

QUnit.test("grade esconde provisório e cancelado", function (assert) {
	const rows = visibleContractFinancialRows([
		row({ Code: "P", Nature: "Provisional" }),
		row({ Code: "C", Nature: "Firm", Status: "Canceled" }),
		row({ Code: "F", Nature: "Firm" }),
		row({ Code: "A", Nature: "Advance", Status: "Settled" })
	]);
	assert.deepEqual(rows.map(r => r.Code), ["F", "A"]);
});

QUnit.test("crédito de adiantamento disponível abate o saldo", function (assert) {
	const s = contractFinancialSummary([
		row({ Nature: "Firm", NetAmount: 1000, OpenAmount: 1000 }),
		row({ Nature: "Advance", Status: "Settled", NetAmount: 400, SettledAmount: 400, AppliedAmount: 100, AvailableAdvanceAmount: 300 })
	]);
	assert.strictEqual(s.AdvanceAmount, 400);
	assert.strictEqual(s.AdvanceAvailable, 300);
	assert.strictEqual(s.OpenAmount, 1000, "adiantamento não entra nos títulos");
	assert.strictEqual(s.Balance, 700);
});

QUnit.test("retenção e devolução são informativas", function (assert) {
	const s = contractFinancialSummary([
		row({ Nature: "Firm", NetAmount: 1000, OpenAmount: 1000 }),
		row({ Nature: "TaxWithholding", NetAmount: 15, OpenAmount: 15 }),
		row({ Nature: "PurchaseReturn", NetAmount: 50, OpenAmount: 50 }),
		row({ Nature: "SalesReturn", NetAmount: 20, OpenAmount: 20 })
	]);
	assert.strictEqual(s.WithholdingOpen, 15);
	assert.strictEqual(s.ReturnsOpen, 70);
	assert.strictEqual(s.Balance, 1000);
});
