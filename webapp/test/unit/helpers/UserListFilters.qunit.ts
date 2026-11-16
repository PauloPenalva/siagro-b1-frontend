import FilterOperator from "sap/ui/model/FilterOperator";
import { buildUserListFilters } from "siagrob1/helpers/UserListFilters";

QUnit.module("UserListFilters - lista de usuários (GAC-1220)");

QUnit.test("sem pesquisa, mostra só os usuários ativos", function (assert) {
	const filters = buildUserListFilters("", false);

	assert.strictEqual(filters.length, 1);
	assert.strictEqual(filters[0].getPath(), "IsActive");
	assert.strictEqual(filters[0].getOperator(), FilterOperator.EQ);
	assert.strictEqual(filters[0].getValue1(), true);
});

QUnit.test("com 'Mostrar inativos' ligado e sem pesquisa, não filtra nada", function (assert) {
	assert.deepEqual(buildUserListFilters("", true), []);
	assert.deepEqual(buildUserListFilters("   ", true), []);
});

QUnit.test("a pesquisa procura em usuário, nome e e-mail, com OU entre eles", function (assert) {
	const filters = buildUserListFilters("yuji", true);

	assert.strictEqual(filters.length, 1);
	assert.strictEqual(filters[0].isAnd(), false);
	assert.deepEqual(
		filters[0].getFilters().map((f): unknown[] => [f.getPath(), f.getOperator(), f.getValue1() as string]),
		[
			["Username", FilterOperator.Contains, "yuji"],
			["FullName", FilterOperator.Contains, "yuji"],
			["Email", FilterOperator.Contains, "yuji"],
		]);
});

QUnit.test("a pesquisa não traz de volta os inativos escondidos", function (assert) {
	const filters = buildUserListFilters("yuji", false);

	assert.strictEqual(filters.length, 2);
	assert.strictEqual(filters[0].getFilters().length, 3);
	assert.strictEqual(filters[1].getPath(), "IsActive");
	assert.strictEqual(filters[1].getValue1(), true);
});
