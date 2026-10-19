import {
	monthRange,
	signedEntryAmount,
	isManual,
	canDeleteEntry,
	reconciliationChanges,
	MovementRow,
} from "siagrob1/helpers/FinancialAccountMovementHelpers";

QUnit.module("FinancialAccountMovementHelpers");

QUnit.test("monthRange devolve o primeiro e o último dia do mês, no calendário local", function (assert) {
	assert.deepEqual(monthRange(new Date(2026, 9, 19, 23, 30)), { from: "2026-10-01", to: "2026-10-31" });
	assert.deepEqual(monthRange(new Date(2028, 1, 10)), { from: "2028-02-01", to: "2028-02-29" });
});

QUnit.test("signedEntryAmount: entrada positiva, saída negativa, valor inválido vira NaN", function (assert) {
	assert.strictEqual(signedEntryAmount("In", 12.5), 12.5);
	assert.strictEqual(signedEntryAmount("Out", 12.5), -12.5);
	assert.ok(Number.isNaN(signedEntryAmount("Out", 0)));
	assert.ok(Number.isNaN(signedEntryAmount("In", -3)));
});

QUnit.test("isManual aceita o enum por nome ou por número", function (assert) {
	assert.ok(isManual({ Source: "Manual" } as MovementRow));
	assert.ok(isManual({ Source: 1 } as MovementRow));
	assert.notOk(isManual({ Source: "Settlement" } as MovementRow));
});

QUnit.test("canDeleteEntry: só lançamento manual não conciliado", function (assert) {
	assert.ok(canDeleteEntry({ Source: "Manual", Reconciled: false } as MovementRow));
	assert.notOk(canDeleteEntry({ Source: "Manual", Reconciled: true } as MovementRow));
	assert.notOk(canDeleteEntry({ Source: "Settlement", Reconciled: false } as MovementRow));
	assert.notOk(canDeleteEntry(undefined));
});

QUnit.test("reconciliationChanges envia só o que mudou, separado por fonte", function (assert) {
	const rows = [
		{ Key: "s1", Source: "Settlement", Marked: false },
		{ Key: "s2", Source: "Settlement", Marked: true },
		{ Key: "e1", Source: "Manual", Marked: false },
		{ Key: "e2", Source: "Manual", Marked: true },
		{ Key: "e3", Source: "Manual", Marked: true },
	] as MovementRow[];

	const changes = reconciliationChanges(rows, new Set(["s1", "e1", "e3"]));

	assert.deepEqual(changes, {
		MarkSettlements: ["s1"],
		MarkEntries: ["e1"],
		UnmarkSettlements: ["s2"],
		UnmarkEntries: ["e2"],
	});
});
