import Filter from "sap/ui/model/Filter";
import { anyOfFilter, unlockedUnitsOfMeasureFilter } from "siagrob1/helpers/FilterHelpers";

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

QUnit.module("FilterHelpers - unlockedUnitsOfMeasureFilter (value help de unidade)");

QUnit.test("unidade sem a flag (Locked nulo) aparece junto com a liberada", function (assert) {
	const filter = unlockedUnitsOfMeasureFilter();
	const conditions = filter.getFilters().map((f: Filter): unknown[] => [f.getPath(), f.getOperator(), f.getValue1() as unknown]);

	assert.strictEqual(filter.isAnd(), false, "as duas condições se unem com or");
	assert.deepEqual(conditions, [["Locked", "EQ", "N"], ["Locked", "EQ", null]]);
});
