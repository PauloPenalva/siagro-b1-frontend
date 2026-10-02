import { PAYMENT_MEANS, PAYMENT_START_RULES, paymentPreviewUrl } from "siagrob1/helpers/NfeHelpers";

QUnit.module("NfeHelpers - condição de pagamento");

QUnit.test("meios de pagamento são os que o servidor aceita", function (assert) {
	assert.deepEqual(PAYMENT_MEANS.map((m) => m.key), ["01", "03", "04", "15", "16", "17", "18", "90", "99"]);
	assert.strictEqual(PAYMENT_MEANS.find((m) => m.key === "15")?.text, "15 - Boleto bancário");
});

QUnit.test("início da contagem usa os nomes do enum", function (assert) {
	assert.deepEqual(PAYMENT_START_RULES.map((r) => r.key), ["IssueDate", "NextMonth"]);
});

QUnit.test("URL da prévia leva os literais do OData, com os dias entre aspas e codificados", function (assert) {
	assert.strictEqual(
		paymentPreviewUrl("30,60", "NextMonth", "15", 1000.5, "2026-10-02"),
		"/odata/PaymentConditionsPreview(Days='30%2C60',StartRule=2,PaymentMeans='15',Total=1000.5,IssueDate=2026-10-02)"
	);
});

QUnit.test("total com vírgula ou vazio não quebra a URL", function (assert) {
	assert.ok(paymentPreviewUrl("0", "IssueDate", "17", Number("abc"), "2026-10-02").includes("Total=0,"));
});
