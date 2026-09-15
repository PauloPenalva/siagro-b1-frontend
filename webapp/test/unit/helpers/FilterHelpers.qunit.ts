import { anyOfFilter } from "siagrob1/helpers/FilterHelpers";

QUnit.module("FilterHelpers - anyOfFilter (filtro de múltipla seleção)");

QUnit.test("nenhum valor marcado não restringe a lista", function (assert) {
	assert.strictEqual(anyOfFilter("Status", []), undefined);
});

QUnit.test("modelo de filtro ainda sem o campo não restringe a lista", function (assert) {
	assert.strictEqual(anyOfFilter("Status", undefined), undefined);
	assert.strictEqual(anyOfFilter("Status", null), undefined);
});

QUnit.test("um valor vira uma comparação simples", function (assert) {
	assert.strictEqual(anyOfFilter("Status", ["Draft"]), "Status eq 'Draft'");
});

QUnit.test("vários valores viram um grupo de or entre parênteses", function (assert) {
	assert.strictEqual(
		anyOfFilter("Status", ["Draft", "Rejected", "InApproval"]),
		"(Status eq 'Draft' or Status eq 'Rejected' or Status eq 'InApproval')"
	);
});

QUnit.test("aspas simples no valor são escapadas", function (assert) {
	assert.strictEqual(anyOfFilter("Code", ["D'Ávila"]), "Code eq 'D''Ávila'");
});
