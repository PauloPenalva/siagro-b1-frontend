import { calculateFreightPrice, freightUnitDescription } from "siagrob1/helpers/FreightHelpers";

QUnit.module("FreightHelpers - total do Frete/Remoção (GAC-1191)");

// Valores conferidos à mão: 30.000 kg = 500 sacas; 1.000 kg = 16,666... sacas × 2,35 = 39,1666...
QUnit.test("Fixo: o total é o próprio unitário, qualquer que seja o peso", function (assert) {
	assert.strictEqual(calculateFreightPrice("Fixed", 1500, 30000), 1500);
	assert.strictEqual(calculateFreightPrice("Fixed", 800, 0), 800);
});

QUnit.test("Saco: peso bruto / 60 × unitário, em 2 casas", function (assert) {
	assert.strictEqual(calculateFreightPrice("PerBag", 3, 30000), 1500);
	assert.strictEqual(calculateFreightPrice("PerBag", 2.35, 1000), 39.17);
	assert.strictEqual(calculateFreightPrice("PerBag", 3, 0), 0);
});

QUnit.test("aceita o decimal que o OData v4 entrega como texto e o campo ainda vazio", function (assert) {
	assert.strictEqual(calculateFreightPrice("PerBag", "3.00", "30000"), 1500);
	assert.strictEqual(calculateFreightPrice("PerBag", null, 30000), 0);
	assert.strictEqual(calculateFreightPrice("PerBag", 3, undefined), 0);
});

QUnit.test("sem método vale Fixo, o padrão do backend", function (assert) {
	assert.strictEqual(calculateFreightPrice(undefined, 800, 30000), 800);
});

QUnit.test("o unitário diz se é por saco ou por viagem", function (assert) {
	assert.strictEqual(freightUnitDescription("PerBag"), "por saco (60 kg)");
	assert.strictEqual(freightUnitDescription("Fixed"), "por viagem");
	assert.strictEqual(freightUnitDescription(undefined), "por viagem");
});
