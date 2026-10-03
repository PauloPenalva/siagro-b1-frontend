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

QUnit.module("formatter - tipo da natureza de operação (NF-e STANDALONE)");

QUnit.test("formatUsageDirection traduz o enum e deixa vazio o nulo do SAPB1", function (assert) {
	assert.strictEqual(formatter.formatUsageDirection("Outgoing"), "Saída");
	assert.strictEqual(formatter.formatUsageDirection("Incoming"), "Entrada");
	assert.strictEqual(formatter.formatUsageDirection(null), "");
});

QUnit.module("formatter - situação da NF-e (STANDALONE)");

QUnit.test("situação vira texto em português", function (assert) {
	assert.strictEqual(formatter.formatNfeStatus("None"), "");
	assert.strictEqual(formatter.formatNfeStatus("Processing"), "Em processamento");
	assert.strictEqual(formatter.formatNfeStatus("Authorized"), "Autorizada");
	assert.strictEqual(formatter.formatNfeStatus("Rejected"), "Rejeitada");
	assert.strictEqual(formatter.formatNfeStatus("Denied"), "Denegada");
});

QUnit.test("cor da situação", function (assert) {
	assert.strictEqual(formatter.stateNfeStatus("Authorized"), "Success");
	assert.strictEqual(formatter.stateNfeStatus("Rejected"), "Error");
	assert.strictEqual(formatter.stateNfeStatus("Denied"), "Error");
	assert.strictEqual(formatter.stateNfeStatus("Processing"), "Warning");
	assert.strictEqual(formatter.stateNfeStatus("None"), "None");
});
