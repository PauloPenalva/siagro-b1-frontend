import { localIsoDate } from "siagrob1/helpers/DateHelpers";

QUnit.module("DateHelpers - data do calendário local");

QUnit.test("localIsoDate devolve o dia LOCAL, não o do UTC, perto da meia-noite", function (assert) {
	// Carga CG000008 (CEAGUI): criada 08/10 às 23:22 em Brasília nasceu com a data 09/10, porque
	// toISOString() já estava no dia seguinte em UTC. Construídas em hora local, as duas datas abaixo
	// pegam o erro tanto a oeste (23:22) quanto a leste (00:30) de Greenwich.
	assert.strictEqual(localIsoDate(new Date(2026, 9, 8, 23, 22)), "2026-10-08");
	assert.strictEqual(localIsoDate(new Date(2026, 9, 8, 0, 30)), "2026-10-08");
});

QUnit.test("localIsoDate completa mês e dia com zero", function (assert) {
	assert.strictEqual(localIsoDate(new Date(2026, 0, 5, 12, 0)), "2026-01-05");
});
