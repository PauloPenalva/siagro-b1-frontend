import {
	destinationFromIndex, destinationParameters, refusalSuccessKind, transitLossConfirmText, validateRefusalForm,
} from "siagrob1/helpers/refusalPayload";

QUnit.module("refusalPayload - destino e validação da recusa de carga");

QUnit.test("índice do grupo de rádio vira o destino, na ordem fixa", function (assert) {
	assert.strictEqual(destinationFromIndex(0), "Rebilling");
	assert.strictEqual(destinationFromIndex(1), "Warehouse");
	assert.strictEqual(destinationFromIndex(2), "Transshipment");
	assert.strictEqual(destinationFromIndex(3), "TransitLoss");
});

QUnit.test("motivo vazio é recusado", function (assert) {
	assert.strictEqual(validateRefusalForm({ DestinationIndex: 0, Reason: "  " }), "Informe o motivo da recusa.");
});

QUnit.test("armazém e transbordo exigem armazém", function (assert) {
	const msg = "Informe o armazém de destino da mercadoria devolvida.";
	assert.strictEqual(validateRefusalForm({ DestinationIndex: 1, Reason: "x" }), msg);
	assert.strictEqual(validateRefusalForm({ DestinationIndex: 2, Reason: "x", DestinationWarehouseCode: " " }), msg);
	assert.strictEqual(validateRefusalForm({ DestinationIndex: 1, Reason: "x", DestinationWarehouseCode: "A1" }), null);
});

QUnit.test("quebra sem tipo é recusada; com tipo e sem armazém passa", function (assert) {
	assert.strictEqual(
		validateRefusalForm({ DestinationIndex: 3, Reason: "x" }), "Informe o tipo da quebra de trajeto.");
	assert.strictEqual(validateRefusalForm({ DestinationIndex: 3, Reason: "x", TransitLossReason: "Theft" }), null);
});

QUnit.test("parâmetros da quebra: armazém null e tipo preenchido", function (assert) {
	assert.deepEqual(
		destinationParameters({ DestinationIndex: 3, DestinationWarehouseCode: "A1", TransitLossReason: "Damage" }),
		{ Destination: "TransitLoss", DestinationWarehouseCode: null, TransitLossReason: "Damage" });
});

QUnit.test("parâmetros do armazém: tipo residual vira null", function (assert) {
	assert.deepEqual(
		destinationParameters({ DestinationIndex: 1, DestinationWarehouseCode: " A1 ", TransitLossReason: "Damage" }),
		{ Destination: "Warehouse", DestinationWarehouseCode: "A1", TransitLossReason: null });
});

QUnit.test("parâmetros do refaturamento: ambos null", function (assert) {
	assert.deepEqual(
		destinationParameters({ DestinationIndex: 0, DestinationWarehouseCode: "A1", TransitLossReason: "Other" }),
		{ Destination: "Rebilling", DestinationWarehouseCode: null, TransitLossReason: null });
});

QUnit.test("índice fora da faixa cai em Rebilling", function (assert) {
	assert.strictEqual(destinationFromIndex(9), "Rebilling");
	assert.strictEqual(destinationFromIndex(-1), "Rebilling");
});

QUnit.test("quebra sem motivo da recusa devolve a mensagem do motivo", function (assert) {
	assert.strictEqual(
		validateRefusalForm({ DestinationIndex: 3, TransitLossReason: "Theft" }), "Informe o motivo da recusa.");
});

QUnit.test("confirmação da quebra: texto base sem NF-e, com sentença extra com NF-e", function (assert) {
	const base = "A quebra de trajeto devolve os documentos selecionados e retira o volume da carga. " +
		"A mercadoria não retorna a nenhum armazém e não fica disponível para faturamento. Confirmar?";
	assert.strictEqual(transitLossConfirmText(false), base);
	assert.strictEqual(
		transitLossConfirmText(true),
		base + " A quebra só é lançada depois que as NF-e de entrada das devoluções forem autorizadas.");
});

QUnit.test("mensagem de sucesso: quebra x NF-e", function (assert) {
	assert.strictEqual(refusalSuccessKind("TransitLoss", false), "TransitLoss");
	assert.strictEqual(refusalSuccessKind("TransitLoss", true), "PendingNfe");
	assert.strictEqual(refusalSuccessKind("Warehouse", true), "PendingNfe");
	assert.strictEqual(refusalSuccessKind("Transshipment", false), "Transshipment");
	assert.strictEqual(refusalSuccessKind("Rebilling", false), "Rebilling");
});
