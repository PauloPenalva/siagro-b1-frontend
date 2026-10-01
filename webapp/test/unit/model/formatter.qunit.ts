import formatter from "siagrob1/model/formatter";

QUnit.module("formatter - formatCodeAndName (coluna \"(código) nome\")");

QUnit.test("código e nome viram \"(código) nome\"", function (assert) {
	assert.strictEqual(formatter.formatCodeAndName("CO", "Centro-Oeste"), "(CO) Centro-Oeste");
});

QUnit.test("sem código a célula fica vazia, e não \"() \"", function (assert) {
	assert.strictEqual(formatter.formatCodeAndName(null, null), "");
	assert.strictEqual(formatter.formatCodeAndName(undefined, undefined), "");
	assert.strictEqual(formatter.formatCodeAndName("", ""), "");
});

QUnit.test("código sem nome mostra só o código", function (assert) {
	assert.strictEqual(formatter.formatCodeAndName("CO", null), "(CO)");
});

QUnit.module("formatter - rateio do ticket e devolução parcial (GAC-1171)");

QUnit.test("formatDischargeShare mostra o documento e a parcela em pt-BR", function (assert) {
	assert.strictEqual(formatter.formatDischargeShare("000100", "20000.000"), "000100 (20.000,000)");
	assert.strictEqual(formatter.formatDischargeShare("", 15000), "(sem número) (15.000,000)");
});

QUnit.test("isPartiallyReturned só marca a nota Confirmada com devolução", function (assert) {
	assert.strictEqual(formatter.isPartiallyReturned("Confirmed", "5000.000"), true);
	assert.strictEqual(formatter.isPartiallyReturned("Confirmed", "0.000"), false);
	assert.strictEqual(formatter.isPartiallyReturned("Returned", "40000.000"), false);
	assert.strictEqual(formatter.isPartiallyReturned("Confirmed", null), false);
});

QUnit.test("formatPartialReturn mostra quanto voltou", function (assert) {
	assert.strictEqual(formatter.formatPartialReturn("5000.000"), "Devolução parcial: 5.000,000");
});
