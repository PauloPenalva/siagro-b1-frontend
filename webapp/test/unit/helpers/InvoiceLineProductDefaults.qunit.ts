import { lineProductDefaults } from "siagrob1/helpers/InvoiceLineProductDefaults";

QUnit.module("InvoiceLineProductDefaults - unidade e conta da linha vêm do produto");

QUnit.test("usa a unidade comercial do complemento e a conta do produto", function (assert) {
	assert.deepEqual(lineProductDefaults("SC", "UN", "1.1.01"), { UnitOfMeasureCode: "SC", LedgerAccountCode: "1.1.01" });
});

QUnit.test("sem complemento cai na unidade padrão do sistema", function (assert) {
	assert.deepEqual(lineProductDefaults(undefined, "UN", "1.1.01"), { UnitOfMeasureCode: "UN", LedgerAccountCode: "1.1.01" });
	assert.deepEqual(lineProductDefaults("  ", "UN", null), { UnitOfMeasureCode: "UN" });
});

QUnit.test("produto sem conta (SAPB1) não devolve conta: a linha mantém a dela", function (assert) {
	assert.deepEqual(lineProductDefaults("KG", "UN", null), { UnitOfMeasureCode: "KG" });
	assert.deepEqual(lineProductDefaults("KG", "UN", "  "), { UnitOfMeasureCode: "KG" });
});

QUnit.test("sem nenhuma unidade nada é devolvido para ela", function (assert) {
	assert.deepEqual(lineProductDefaults(null, "", "2.1"), { LedgerAccountCode: "2.1" });
	assert.deepEqual(lineProductDefaults(), {});
});
