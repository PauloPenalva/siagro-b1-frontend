import { calculateSalesWashoutAmount, calculateWashoutAmount } from "siagrob1/helpers/WashoutHelpers";

QUnit.module("WashoutHelpers - prévia do valor do washout");

QUnit.test("venda: contrato acima do mercado cobra a diferença mais a multa", function (assert) {
	assert.strictEqual(calculateSalesWashoutAmount(90, 100, 1000, 500), 10500);
});

QUnit.test("venda: mercado acima do contrato cobra só a multa", function (assert) {
	assert.strictEqual(calculateSalesWashoutAmount(110, 100, 1000, 500), 500);
});

QUnit.test("compra continua com o sinal da compra", function (assert) {
	assert.strictEqual(calculateWashoutAmount(2.75, 2.5, 10000, 1000), 3500);
});
