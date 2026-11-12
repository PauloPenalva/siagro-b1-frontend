import { discountDescription, pricePerBagDescription } from "siagrob1/helpers/StorageExpenseHelpers";

QUnit.module("StorageExpenseHelpers - despesas do romaneio em % e por saca (GAC-1197)");

// Romaneio 00012783 da Yokotobi (print do chamado): bruto 18.820 kg = 313,666... sacas.
QUnit.test("desconto: kg sobre o peso bruto, em % com 2 casas, depois da unidade", function (assert) {
	assert.strictEqual(discountDescription("KG", 530.724, 18820), "KG · 2,82%");
	assert.strictEqual(discountDescription("KG", 263.48, 18820), "KG · 1,40%");
	assert.strictEqual(discountDescription("KG", 470.5, 18820), "KG · 2,50%");
	assert.strictEqual(discountDescription("KG", 0, 18820), "KG · 0,00%");
});

QUnit.test("valor: R$ sobre as sacas de 60 kg do peso bruto, com 2 casas, depois da moeda", function (assert) {
	assert.strictEqual(pricePerBagDescription("R$", 439.13, 18820), "R$ · 1,40/SC");
	assert.strictEqual(pricePerBagDescription("R$", 0, 18820), "R$ · 0,00/SC");
	assert.strictEqual(pricePerBagDescription("R$", 1500, 30000), "R$ · 3,00/SC");
});

QUnit.test("sem peso bruto não há base: fica só a unidade, sem dividir por zero", function (assert) {
	assert.strictEqual(discountDescription("KG", 100, 0), "KG");
	assert.strictEqual(discountDescription("KG", 100, null), "KG");
	assert.strictEqual(pricePerBagDescription("R$", 100, 0), "R$");
	assert.strictEqual(pricePerBagDescription("R$", 100, undefined), "R$");
});

QUnit.test("aceita o decimal que o OData v4 entrega como texto e o campo ainda vazio", function (assert) {
	assert.strictEqual(discountDescription("KG", "530.724", "18820.000"), "KG · 2,82%");
	assert.strictEqual(pricePerBagDescription("R$", "439.13", "18820.000"), "R$ · 1,40/SC");
	assert.strictEqual(discountDescription("KG", null, 18820), "KG · 0,00%");
	assert.strictEqual(pricePerBagDescription("R$", undefined, 18820), "R$ · 0,00/SC");
});

QUnit.test("unidade ou moeda ainda não carregada não deixa separador solto", function (assert) {
	assert.strictEqual(discountDescription(undefined, 530.724, 18820), "2,82%");
	assert.strictEqual(pricePerBagDescription("", 439.13, 18820), "1,40/SC");
	assert.strictEqual(discountDescription(undefined, 1, 0), "");
});
