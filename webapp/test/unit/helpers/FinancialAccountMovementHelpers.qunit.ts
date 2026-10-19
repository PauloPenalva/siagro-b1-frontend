import {
	monthRange,
	signedEntryAmount,
	isManual,
	canDeleteEntry,
	reconciliationChanges,
	reconciliationSummary,
	markedKeys,
	statementDay,
	monthStart,
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

QUnit.test("reconciliationSummary soma o selecionado e calcula a diferença contra o extrato", function (assert) {
	const rows = [
		{ Key: "a", Amount: "-10.50" },
		{ Key: "b", Amount: 300 },
		{ Key: "c", Amount: -5 },
	] as MovementRow[];

	const summary = reconciliationSummary(rows, new Set(["a", "b"]), 100, 389.5);

	assert.strictEqual(summary.reconciledAmount, 289.5);
	assert.strictEqual(summary.difference, 0);
	assert.strictEqual(reconciliationSummary(rows, new Set(["a"]), 100, 389.5).difference, -300);
});

QUnit.test("markedKeys devolve as linhas já marcadas no servidor", function (assert) {
	const rows = [{ Key: "a", Marked: true }, { Key: "b", Marked: false }] as MovementRow[];
	assert.deepEqual([...markedKeys(rows)], ["a"]);
});

QUnit.test("statementDay lê o dia da data do servidor sem passar pelo fuso do navegador", function (assert) {
	// Servidor em UTC (VPS Linux): meia-noite UTC é 21:00 do dia anterior em Brasília.
	assert.strictEqual(statementDay("2026-10-31T00:00:00Z"), "2026-10-31");
	assert.strictEqual(statementDay("2026-10-01T00:00:00-03:00"), "2026-10-01");
	assert.strictEqual(monthStart("2026-10-31T00:00:00Z"), "2026-10-01");
});
