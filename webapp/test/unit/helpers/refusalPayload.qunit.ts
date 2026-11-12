import { destinationFromIndex, destinationParameters, validateRefusalForm } from "siagrob1/helpers/refusalPayload";

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
