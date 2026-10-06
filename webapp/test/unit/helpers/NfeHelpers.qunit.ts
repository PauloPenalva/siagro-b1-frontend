import {
	PAYMENT_MEANS, PAYMENT_START_RULES, paymentPreviewUrl, certificateDaysToExpire, certificateState, environmentCode, readFileAsBase64, nfeOutcomeMessage, isManualTaxDocumentBlocked,
	danfeViewerOptions, isValidNfeCancelJustification, canCancelNfe, needsNfeCancellationCompletion, isReversibleNfeStatus,
	normalizeNfeCorrectionText, invalidNfeCorrectionChars, isValidNfeCorrectionText, canSendNfeCorrection, correctionViewerOptions, pickNfeCorrectionPrefill,
} from "siagrob1/helpers/NfeHelpers";
import type { NfeOutcome } from "siagrob1/helpers/NfeHelpers";

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

QUnit.test("autorizada sem confirmação não diz que o documento foi confirmado", function (assert) {
	assert.deepEqual(nfeOutcomeMessage({ NfeStatus: "Authorized", InvoiceStatus: "Pending" }),
		{ type: "success", text: "NF-e autorizada." });
});

QUnit.test("consulta de autorizada com outro retorno mostra a situação na SEFAZ", function (assert) {
	assert.deepEqual(nfeOutcomeMessage({ NfeStatus: "Authorized", StatusCode: "217", Reason: "NF-e não consta na base de dados da SEFAZ" }),
		{ type: "warning", text: "Situação na SEFAZ: 217 - NF-e não consta na base de dados da SEFAZ" });
});

QUnit.test("autorizada com 100 ou 150 segue como sucesso", function (assert) {
	assert.deepEqual(nfeOutcomeMessage({ NfeStatus: "Authorized", InvoiceStatus: "Confirmed", StatusCode: "100", Reason: "Autorizado o uso da NF-e" }),
		{ type: "success", text: "NF-e autorizada e documento confirmado." });
	assert.deepEqual(nfeOutcomeMessage({ NfeStatus: "Authorized", StatusCode: "150", Reason: "Autorizado o uso da NF-e, autorização fora de prazo" }),
		{ type: "success", text: "NF-e autorizada." });
});

QUnit.module("NfeHelpers - Informar Nota Fiscal manual");

QUnit.test("regra de bloqueio por situação, trava e tipo", function (assert) {
	assert.strictEqual(isManualTaxDocumentBlocked("None", false, "Normal"), false, "SAPB1/None");
	assert.strictEqual(isManualTaxDocumentBlocked("None", false, "Normal"), false, "MH Agro, sem trava");
	assert.strictEqual(isManualTaxDocumentBlocked("None", true, "Normal"), true, "CEAGUI Normal");
	assert.strictEqual(isManualTaxDocumentBlocked("None", true, "Return"), false, "CEAGUI devolução");
	assert.strictEqual(isManualTaxDocumentBlocked("None", true, "Return", true), true, "CEAGUI devolução própria");
	assert.strictEqual(isManualTaxDocumentBlocked("None", false, "Return", true), true, "devolução própria vem da emissão");
	assert.strictEqual(isManualTaxDocumentBlocked("Authorized", false, "Normal"), true, "já emitida");
	assert.strictEqual(isManualTaxDocumentBlocked(undefined, false, "Normal"), false, "status indefinido");
	assert.strictEqual(isManualTaxDocumentBlocked(null, false, "Normal"), false, "status nulo");
});

QUnit.module("NfeHelpers - visualizador do DANFE");

QUnit.test("título com número sem zeros à esquerda e série; arquivo com a chave, como o XML", function (assert) {
	assert.deepEqual(
		danfeViewerOptions({
			ChaveNFe: "35261068583898000101550090000000091119608953", TaxDocumentNumber: "000000009", TaxDocumentSeries: "9",
		}),
		{ title: "DANFE – NF-e nº 9 série 9", fileName: "35261068583898000101550090000000091119608953-danfe.pdf" },
	);
});

QUnit.test("sem série, o título fica só com o número", function (assert) {
	assert.strictEqual(
		danfeViewerOptions({ ChaveNFe: "1", TaxDocumentNumber: "000000123", TaxDocumentSeries: null }).title,
		"DANFE – NF-e nº 123",
	);
});

QUnit.test("sem número, o título é só DANFE", function (assert) {
	assert.strictEqual(
		danfeViewerOptions({ ChaveNFe: "1", TaxDocumentNumber: "  ", TaxDocumentSeries: "9" }).title, "DANFE",
	);
	assert.strictEqual(danfeViewerOptions({ ChaveNFe: "1", TaxDocumentNumber: null, TaxDocumentSeries: null }).title, "DANFE");
});

QUnit.test("número todo zero vira 0, não some", function (assert) {
	assert.strictEqual(
		danfeViewerOptions({ ChaveNFe: "1", TaxDocumentNumber: "000", TaxDocumentSeries: "1" }).title, "DANFE – NF-e nº 0 série 1",
	);
});

QUnit.test("sem chave, o arquivo se chama danfe.pdf", function (assert) {
	assert.strictEqual(
		danfeViewerOptions({ ChaveNFe: null, TaxDocumentNumber: "9", TaxDocumentSeries: "9" }).fileName, "danfe.pdf",
	);
});

QUnit.module("NfeHelpers - cancelamento");

QUnit.test("justificativa conta depois do trim, de 15 a 255", function (assert) {
	assert.strictEqual(isValidNfeCancelJustification("   curta demais "), false);
	assert.strictEqual(isValidNfeCancelJustification("  Venda desfeita pelo cliente  "), true);
	assert.strictEqual(isValidNfeCancelJustification("x".repeat(255)), true);
	assert.strictEqual(isValidNfeCancelJustification("x".repeat(256)), false);
});

QUnit.test("só NF-e autorizada de documento ativo é cancelável", function (assert) {
	assert.strictEqual(canCancelNfe("Authorized", "Confirmed"), true);
	assert.strictEqual(canCancelNfe("Authorized", "Pending"), true);
	assert.strictEqual(canCancelNfe("Authorized", "Cancelled"), false);
	assert.strictEqual(canCancelNfe("Processing", "Pending"), false);
	assert.strictEqual(canCancelNfe("Cancelled", "Confirmed"), false);
});

QUnit.test("concluir cancelamento só com NF-e cancelada e documento ativo", function (assert) {
	assert.strictEqual(needsNfeCancellationCompletion("Cancelled", "Confirmed"), true);
	assert.strictEqual(needsNfeCancellationCompletion("Cancelled", "Cancelled"), false);
	assert.strictEqual(needsNfeCancellationCompletion("Authorized", "Confirmed"), false);
});

QUnit.test("estorno só sem NF-e emitida", function (assert) {
	assert.strictEqual(isReversibleNfeStatus(undefined), true);
	assert.strictEqual(isReversibleNfeStatus("None"), true);
	assert.strictEqual(isReversibleNfeStatus("Rejected"), true);
	assert.strictEqual(isReversibleNfeStatus("Processing"), false);
	assert.strictEqual(isReversibleNfeStatus("Authorized"), false);
	assert.strictEqual(isReversibleNfeStatus("Cancelled"), false);
});

QUnit.test("desfecho do cancelamento", function (assert) {
	assert.deepEqual(nfeOutcomeMessage({ NfeStatus: "Cancelled", InvoiceStatus: "Cancelled" }),
		{ type: "success", text: "NF-e cancelada e documento cancelado." });
	assert.deepEqual(nfeOutcomeMessage({ NfeStatus: "Cancelled", InvoiceStatus: "Confirmed", CancellationError: "Liberação travada." }),
		{ type: "warning", text: "NF-e cancelada na SEFAZ, mas o cancelamento do documento falhou: Liberação travada. Corrija e use Concluir cancelamento." });
});

QUnit.module("NfeHelpers - carta de correção");

QUnit.test("texto é normalizado como no servidor", function (assert) {
	assert.strictEqual(normalizeNfeCorrectionText("  Placa\r\nABC\t  1  "), "Placa ABC 1");
	assert.strictEqual(normalizeNfeCorrectionText("“X” – ‘Y’…"), "\"X\" - 'Y'...");
	assert.strictEqual(normalizeNfeCorrectionText(null), "");
});

QUnit.test("espaço em branco segue char.IsWhiteSpace do .NET", function (assert) {
	const bom = String.fromCharCode(0xFEFF);
	assert.strictEqual(normalizeNfeCorrectionText(bom + "abc"), bom + "abc");
	assert.deepEqual(invalidNfeCorrectionChars(bom + "abc"), [bom]);
	assert.strictEqual(normalizeNfeCorrectionText("abc" + String.fromCharCode(0x85)), "abc");
});

QUnit.test("caracteres fora do Latin-1 são apontados uma vez", function (assert) {
	assert.deepEqual(invalidNfeCorrectionChars("Valor € errado ✓ e € de novo"), ["€", "✓"]);
	assert.deepEqual(invalidNfeCorrectionChars("Correção do endereço nº 10"), []);
});

QUnit.test("texto válido tem 15 a 1000 caracteres normalizados e nada fora do Latin-1", function (assert) {
	assert.notOk(isValidNfeCorrectionText("curta    \n   "));
	assert.ok(isValidNfeCorrectionText("x".repeat(15)));
	assert.ok(isValidNfeCorrectionText("x".repeat(1000)));
	assert.notOk(isValidNfeCorrectionText("x".repeat(1001)));
	assert.notOk(isValidNfeCorrectionText("Texto longo o bastante €"));
});

QUnit.test("carta só para NF-e autorizada de documento ativo e emissão própria", function (assert) {
	assert.ok(canSendNfeCorrection("Authorized", "Confirmed"));
	assert.ok(canSendNfeCorrection("Authorized", "Pending", "Own"));
	assert.notOk(canSendNfeCorrection("Authorized", "Confirmed", "ThirdParty"));
	assert.notOk(canSendNfeCorrection("Authorized", "Cancelled"));
	assert.notOk(canSendNfeCorrection("Cancelled", "Cancelled"));
	assert.notOk(canSendNfeCorrection("Processing", "Pending"));
});

QUnit.test("título e arquivo do PDF da carta", function (assert) {
	assert.deepEqual(
		correctionViewerOptions({ ChaveNFe: "3526", TaxDocumentNumber: "000000009", TaxDocumentSeries: "9" }, 2),
		{ title: "Carta de Correção nº 2 – NF-e nº 9 série 9", fileName: "3526-cce-2.pdf" });
});

QUnit.test("consulta avisa as cartas importadas", function (assert) {
	const message = nfeOutcomeMessage({ NfeStatus: "Authorized", StatusCode: "100", InvoiceStatus: "Confirmed", ImportedCorrections: 2 } as NfeOutcome);
	assert.strictEqual(message.type, "success");
	assert.ok(message.text.endsWith(" 2 carta(s) de correção importada(s) da SEFAZ."));
});

QUnit.module("NfeHelpers - texto da carta de correção reaberto");

QUnit.test("texto que falhou no mesmo documento vence a última carta registrada", function (assert) {
	assert.strictEqual(pickNfeCorrectionPrefill({ key: "k1", text: "texto digitado" }, "k1", "carta registrada"), "texto digitado");
});

QUnit.test("texto que falhou em outro documento é ignorado", function (assert) {
	assert.strictEqual(pickNfeCorrectionPrefill({ key: "k2", text: "texto digitado" }, "k1", "carta registrada"), "carta registrada");
});

QUnit.test("sem falha guardada usa a última carta registrada", function (assert) {
	assert.strictEqual(pickNfeCorrectionPrefill(undefined, "k1", "carta registrada"), "carta registrada");
});

