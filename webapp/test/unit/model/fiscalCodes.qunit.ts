import { PIS_COFINS_INCOMING_CSTS, PIS_COFINS_OUTGOING_CSTS } from "siagrob1/model/fiscalCodes";

QUnit.module("fiscalCodes - listas de CST de PIS/COFINS (NF-e STANDALONE)");

QUnit.test("a lista de saída só tem 01 a 09 e 49, além do vazio", function (assert) {
	const keys = PIS_COFINS_OUTGOING_CSTS.map((o) => o.key);
	assert.deepEqual(keys, ["", "01", "02", "03", "04", "05", "06", "07", "08", "09", "49"]);
});

QUnit.test("a lista de entrada só tem códigos de 50 em diante, além do vazio", function (assert) {
	const keys = PIS_COFINS_INCOMING_CSTS.map((o) => o.key).filter((k) => k !== "");
	assert.ok(keys.length > 0);
	assert.ok(keys.every((k) => Number(k) >= 50), "nenhum CST de saída na lista de entrada");
	assert.strictEqual(PIS_COFINS_INCOMING_CSTS[0].key, "", "o primeiro item é o não informado");
});
