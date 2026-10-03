import {
	PAYMENT_MEANS, PAYMENT_START_RULES, paymentPreviewUrl, certificateDaysToExpire, certificateState, environmentCode, readFileAsBase64, nfeOutcomeMessage,
} from "siagrob1/helpers/NfeHelpers";

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

QUnit.module("NfeHelpers - certificado e ambiente");

QUnit.test("dias para vencer contam a partir de hoje", function (assert) {
	const today = new Date(2026, 9, 2);
	assert.strictEqual(certificateDaysToExpire("2026-10-12T15:00:00-03:00", today), 10);
	assert.strictEqual(certificateDaysToExpire("2026-09-30T00:00:00-03:00", today), -2);
	assert.strictEqual(certificateDaysToExpire(undefined, today), undefined);
});

QUnit.test("situação do certificado: vencido, perto de vencer, ok", function (assert) {
	assert.strictEqual(certificateState(-1), "Error");
	assert.strictEqual(certificateState(29), "Warning");
	assert.strictEqual(certificateState(30), "Success");
	assert.strictEqual(certificateState(undefined), "None");
});

QUnit.test("ambiente vai ao servidor pelo número do enum", function (assert) {
	assert.strictEqual(environmentCode("Production"), 1);
	assert.strictEqual(environmentCode("Homologation"), 2);
	assert.strictEqual(environmentCode(undefined), 2);
});

QUnit.test("arquivo binário vira base64 sem perder bytes fora do UTF-8", function (assert) {
	const bytes = [0x00, 0xff, 0x80, 0x7f, 0xc3, 0x28];
	const file = new File([new Uint8Array(bytes)], "cert.pfx");

	const done = assert.async();
	assert.expect(2);

	void readFileAsBase64(file).then((base64) => {
		assert.notOk(base64.includes("data:"), "sem o prefixo data:");
		assert.deepEqual(Array.from(atob(base64), (c) => c.charCodeAt(0)), bytes);
		done();
	});
});

QUnit.module("NfeHelpers - desfecho da emissão");

QUnit.test("autorizada e confirmada é sucesso", function (assert) {
	assert.deepEqual(nfeOutcomeMessage({ NfeStatus: "Authorized", InvoiceStatus: "Confirmed" }),
		{ type: "success", text: "NF-e autorizada e documento confirmado." });
});

QUnit.test("autorizada com confirmação falha pede Concluir confirmação", function (assert) {
	const message = nfeOutcomeMessage({ NfeStatus: "Authorized", ConfirmationError: "Liberação sem saldo." });
	assert.strictEqual(message.type, "warning");
	assert.ok(message.text.includes("Liberação sem saldo."));
	assert.ok(message.text.includes("Concluir confirmação"));
});

QUnit.test("rejeitada mostra código e motivo", function (assert) {
	assert.deepEqual(nfeOutcomeMessage({ NfeStatus: "Rejected", StatusCode: "209", Reason: "IE do emitente inválida" }),
		{ type: "error", text: "NF-e rejeitada: 209 - IE do emitente inválida" });
});

QUnit.test("rejeição local, sem código, mostra só o motivo", function (assert) {
	assert.strictEqual(nfeOutcomeMessage({ NfeStatus: "Rejected", Reason: "Rejeitada na validação local" }).text,
		"NF-e rejeitada: Rejeitada na validação local");
});

QUnit.test("em processamento é aviso com o motivo", function (assert) {
	assert.deepEqual(nfeOutcomeMessage({ NfeStatus: "Processing", Reason: "Sem resposta da SEFAZ — use Consultar situação." }),
		{ type: "warning", text: "Sem resposta da SEFAZ — use Consultar situação." });
});

QUnit.test("denegada é erro", function (assert) {
	assert.strictEqual(nfeOutcomeMessage({ NfeStatus: "Denied", StatusCode: "302", Reason: "Uso Denegado" }).type, "error");
});
