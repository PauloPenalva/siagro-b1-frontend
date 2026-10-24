import {
	activeItemsCount, cteRouteText, dueDateText, buildFreightInvoiceBatchPayload, buildFreightInvoiceSavePayload, buildFreightInvoicesFilter, eligibleCtesUrl,
	emptyFreightInvoiceForm, freightInvoiceActions, freightInvoiceFormError, freightInvoiceStatusText, invoiceOfCteFilter, selectedTotal,
} from "siagrob1/helpers/FreightInvoiceHelpers";

QUnit.module("FreightInvoiceHelpers");

QUnit.test("situação e ações", function (assert) {
	assert.strictEqual(freightInvoiceStatusText("Issued"), "Emitida");
	assert.deepEqual(freightInvoiceActions("Draft"), { edit: true, issue: true, cancel: true, print: true });
	assert.deepEqual(freightInvoiceActions("Cancelled"), { edit: false, issue: false, cancel: false, print: false });
});

QUnit.test("URL dos elegíveis manda os quatro parâmetros, vazios inclusive", function (assert) {
	assert.strictEqual(eligibleCtesUrl("/odata/F", "0001", "C'1", "", ""),
		"/odata/F(BranchCode='0001',TakerCardCode='C''1',From='',To='')");
	assert.strictEqual(eligibleCtesUrl("/odata/F", "0001", "C1", "2026-10-01", "2026-10-31T00:00:00"),
		"/odata/F(BranchCode='0001',TakerCardCode='C1',From='2026-10-01',To='2026-10-31')");
});

QUnit.test("total selecionado e contagem de itens ativos", function (assert) {
	assert.strictEqual(selectedTotal([{ Amount: 10.1, selected: true }, { Amount: "20.2", selected: true }, { Amount: 99, selected: false }]), 30.3);
	assert.strictEqual(activeItemsCount([{ IsActive: true }, { IsActive: false }, {}]), 2);
	assert.strictEqual(activeItemsCount(null), 0);
});

QUnit.test("payload do FreightInvoicesSave", function (assert) {
	const f = { ...emptyFreightInvoiceForm("0001"), TakerCardCode: " C1 ", IssueDate: "2026-10-24", DueDate: "", PaymentConditionCode: "3", Observation: " " };
	const p = buildFreightInvoiceSavePayload(f, ["k1", "k2"]).Model;
	assert.strictEqual(p.Key, null);
	assert.strictEqual(p.TakerCardCode, "C1");
	assert.strictEqual(p.IssueDate, new Date(2026, 9, 24).toISOString());
	assert.strictEqual(p.DueDate, null);
	assert.strictEqual(p.PaymentConditionCode, 3);
	assert.strictEqual(p.Observation, null);
	assert.deepEqual(p.TransportDocumentKeys, ["k1", "k2"]);
});

QUnit.test("validação do formulário", function (assert) {
	const f = { ...emptyFreightInvoiceForm("0001"), TakerCardCode: "C1", IssueDate: "2026-10-24" };
	assert.strictEqual(freightInvoiceFormError(f, []), "Selecione ao menos um CT-e.");
	assert.strictEqual(freightInvoiceFormError({ ...f, DueDate: "2026-10-01" }, ["k"]), "O vencimento não pode ser anterior à emissão.");
	assert.strictEqual(freightInvoiceFormError(f, ["k"]), "");
});

QUnit.test("payload do lote: tomador vazio vira null", function (assert) {
	assert.deepEqual(buildFreightInvoiceBatchPayload({ BranchCode: "0001", From: "2026-10-01", To: "2026-10-31", TakerCardCode: "", Issue: true }),
		{ BranchCode: "0001", From: "2026-10-01", To: "2026-10-31", TakerCardCode: null, Issue: true });
});

QUnit.test("filtro da lista: enum em texto e 'até' inclui o dia", function (assert) {
	assert.strictEqual(buildFreightInvoicesFilter({}), undefined);
	const s = buildFreightInvoicesFilter({ TakerCardCode: "C1", Statuses: ["Draft", "Issued"], DateTo: "2026-10-31" });
	assert.ok(s.startsWith("TakerCardCode eq 'C1' and (Status eq 'Draft' or Status eq 'Issued') and IssueDate lt 2026-11-01T00:00:00"), s);
	assert.strictEqual(invoiceOfCteFilter("g"), "Items/any(i: i/TransportDocumentKey eq g and i/IsActive) and Status ne 'Cancelled'");
});

QUnit.test("vencimento do detalhe: títulos, DueDate, condição", function (assert) {
	assert.strictEqual(dueDateText(["2026-11-30T00:00:00Z"], null, "30 dias"), "30/11/2026");
	assert.strictEqual(dueDateText(["2026-12-30", "2026-11-30", "2027-01-29"], null, ""), "1ª 30/11/2026 … 29/01/2027 (3 parcelas)");
	assert.strictEqual(dueDateText([], "2026-11-15T00:00:00Z", "x"), "15/11/2026");
	assert.strictEqual(dueDateText([], null, "30 dias"), "Pela condição: 30 dias");
	assert.strictEqual(dueDateText([], null, ""), "");
});

QUnit.test("percurso do item do rascunho", function (assert) {
	assert.strictEqual(cteRouteText({ "4106902": "Curitiba" }, "4106902", "PR", "9999999", ""), "Curitiba/PR → 9999999");
});
