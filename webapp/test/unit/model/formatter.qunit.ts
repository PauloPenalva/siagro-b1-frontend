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
