import { prefillNfeReturnRows, hasReturnableBalance, buildNfeReturnPayload, NfeReturnRow } from "siagrob1/helpers/NfeReturnHelpers";

function row(overrides: Partial<NfeReturnRow> = {}): NfeReturnRow {
	return {
		OriginItemKey: "k1", ItemCode: "1", ItemName: "TRIGO", SoldQuantity: 30000, ReturnedQuantity: 10000,
		Returnable: 20000, ReturnQuantity: 20000, ...overrides,
	};
}

QUnit.module("NfeReturnHelpers");

QUnit.test("abre com o saldo de cada item preenchido", function (assert) {
	const rows = prefillNfeReturnRows([row({ ReturnQuantity: 0 }), row({ OriginItemKey: "k2", Returnable: 0, ReturnQuantity: 5 })]);
	assert.strictEqual(rows[0].ReturnQuantity, 20000);
	assert.strictEqual(rows[1].ReturnQuantity, 0);
});

QUnit.test("saldo a devolver existe se algum item tem saldo", function (assert) {
	assert.strictEqual(hasReturnableBalance([row({ Returnable: 0 }), row({ Returnable: 1 })]), true);
	assert.strictEqual(hasReturnableBalance([row({ Returnable: 0 })]), false);
});

QUnit.test("monta o corpo só com os itens que voltam", function (assert) {
	const result = buildNfeReturnPayload([row(), row({ OriginItemKey: "k2", ReturnQuantity: 0 })], "  Carga recusada ");
	assert.deepEqual(result, { ok: true, payload: { OriginItemKeys: ["k1"], Quantities: [20000], Reason: "Carga recusada" } });
});

QUnit.test("motivo é obrigatório", function (assert) {
	assert.deepEqual(buildNfeReturnPayload([row()], " "), { ok: false, message: "Informe o motivo da devolução." });
});

QUnit.test("ao menos um item precisa voltar", function (assert) {
	assert.deepEqual(buildNfeReturnPayload([row({ ReturnQuantity: 0 })], "x"),
		{ ok: false, message: "Informe a quantidade a devolver de ao menos um item." });
});

QUnit.test("quantidade acima do saldo é recusada", function (assert) {
	assert.deepEqual(buildNfeReturnPayload([row({ ReturnQuantity: 20001 })], "x"),
		{ ok: false, message: "Item 1: a quantidade a devolver passa do saldo (20000)." });
});

QUnit.test("quantidade negativa é recusada", function (assert) {
	assert.deepEqual(buildNfeReturnPayload([row({ ReturnQuantity: -1 })], "x"),
		{ ok: false, message: "Item 1: quantidade inválida." });
});

QUnit.test("campo apagado (null) fica de fora, sem erro", function (assert) {
	const result = buildNfeReturnPayload([row({ ReturnQuantity: null }), row({ OriginItemKey: "k2" })], "x");
	assert.deepEqual(result, { ok: true, payload: { OriginItemKeys: ["k2"], Quantities: [20000], Reason: "x" } });
});
