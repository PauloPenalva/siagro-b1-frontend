import { buildDimsModel, isVisible, label, dimensionForRole } from "siagrob1/helpers/DimensionHelpers";

QUnit.module("DimensionHelpers - dimensões gerenciais");

const rows = [
	{ Number: 2, Name: "Veículo", Active: true, Role: "Vehicle" },
	{ Number: 1, Name: "Centro de Custo", Active: true, Role: "None" },
	{ Number: 3, Name: "Safra", Active: false, Role: "None" }
];

QUnit.test("buildDimsModel devolve 5 linhas ordenadas por Number", function (assert) {
	const dims = buildDimsModel(rows);
	assert.deepEqual(dims.items.map(i => i.Number), [1, 2, 3, 4, 5]);
	assert.strictEqual(dims.items[4].Active, false, "ausente fica inativa");
});

QUnit.test("isVisible é falso para dimensão inativa ou ausente", function (assert) {
	const dims = buildDimsModel(rows);
	assert.strictEqual(isVisible(dims, 1), true);
	assert.strictEqual(isVisible(dims, 3), false, "inativa");
	assert.strictEqual(isVisible(dims, 5), false, "ausente");
});

QUnit.test("label devolve o nome configurado", function (assert) {
	const dims = buildDimsModel(rows);
	assert.strictEqual(label(dims, 2), "Veículo");
	assert.strictEqual(label(dims, 4), "");
});

QUnit.test("aceita camelCase do REST e acha a dimensão por papel", function (assert) {
	const dims = buildDimsModel([{ number: 4, name: "Sócio", active: true, role: "Partner" }]);
	assert.strictEqual(label(dims, 4), "Sócio");
	assert.strictEqual(dimensionForRole(dims, "Partner"), 4);
	assert.strictEqual(dimensionForRole(dims, "Vehicle"), undefined);
});

QUnit.test("buildDimsModel resume a dimensão de papel Parceiro", function (assert) {
	const dims = buildDimsModel([{ number: 4, name: "Sócio", active: true, role: "Partner" }]);
	assert.deepEqual(dims.partner, { exists: true, number: 4, label: "Padrão de Sócio" });
	assert.strictEqual(buildDimsModel([]).partner.exists, false);
});
