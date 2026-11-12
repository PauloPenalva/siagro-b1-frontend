import {
	cashFlowDateKey,
	filterReleasesBySupplier,
	ReleaseRow,
	summarizeReleasesBySupplier,
} from "siagrob1/helpers/ShippingSupplierSummaryHelpers";

function release(overrides: Partial<ReleaseRow>): ReleaseRow {
	return {
		ShipmentReleaseKey: "k",
		FCode: "F001",
		FName: "FAZENDA BOA VISTA",
		TaxId: "12345678000190",
		City: "Sorriso",
		State: "MT",
		UnitOfMeasureCode: "KG",
		StandardCashFlowDate: "2026-11-20T00:00:00",
		AvailableQuantity: 1000,
		...overrides,
	};
}

QUnit.module("ShippingSupplierSummaryHelpers - resumo por fornecedor na Expedição (GAC-1224)");

QUnit.test("cashFlowDateKey reduz a data ao dia e trata ausência como vazio", function (assert) {
	assert.strictEqual(cashFlowDateKey("2026-11-20T00:00:00"), "2026-11-20");
	assert.strictEqual(cashFlowDateKey("2026-11-20T00:00:00.0000000Z"), "2026-11-20");
	assert.strictEqual(cashFlowDateKey(null), "");
	assert.strictEqual(cashFlowDateKey(undefined), "");
	assert.strictEqual(cashFlowDateKey(""), "");
});

QUnit.test("várias liberações do mesmo fornecedor e data viram uma linha com saldo somado", function (assert) {
	const summary = summarizeReleasesBySupplier([
		release({ ShipmentReleaseKey: "a", AvailableQuantity: 1000.5 }),
		release({ ShipmentReleaseKey: "b", AvailableQuantity: 2000.25 }),
		release({ ShipmentReleaseKey: "c", AvailableQuantity: 0.1 }),
	]);

	assert.strictEqual(summary.length, 1);
	assert.strictEqual(summary[0].FCode, "F001");
	assert.strictEqual(summary[0].FName, "FAZENDA BOA VISTA");
	assert.strictEqual(summary[0].TaxId, "12345678000190");
	assert.strictEqual(summary[0].City, "Sorriso");
	assert.strictEqual(summary[0].State, "MT");
	assert.strictEqual(summary[0].UnitOfMeasureCode, "KG");
	assert.strictEqual(summary[0].CashFlowDateKey, "2026-11-20");
	assert.strictEqual(summary[0].ReleaseCount, 3);
	assert.strictEqual(summary[0].AvailableQuantity, 3000.85);
});

QUnit.test("a soma não carrega erro de ponto flutuante além de 3 casas", function (assert) {
	const summary = summarizeReleasesBySupplier([
		release({ AvailableQuantity: 0.1 }),
		release({ AvailableQuantity: 0.2 }),
	]);

	assert.strictEqual(summary[0].AvailableQuantity, 0.3);
});

QUnit.test("o mesmo fornecedor com previsões diferentes aparece em linhas separadas", function (assert) {
	const summary = summarizeReleasesBySupplier([
		release({ StandardCashFlowDate: "2026-11-20T00:00:00", AvailableQuantity: 100 }),
		release({ StandardCashFlowDate: "2026-11-25T00:00:00", AvailableQuantity: 200 }),
		release({ StandardCashFlowDate: null, AvailableQuantity: 300 }),
	]);

	assert.deepEqual(
		summary.map((s) => [s.CashFlowDateKey, s.AvailableQuantity]),
		[["2026-11-20", 100], ["2026-11-25", 200], ["", 300]]
	);
});

QUnit.test("ordena pela previsão mais próxima, sem data no fim e fornecedor como desempate", function (assert) {
	const summary = summarizeReleasesBySupplier([
		release({ FCode: "F003", FName: "ZULMIRA", StandardCashFlowDate: null }),
		release({ FCode: "F002", FName: "JOÃO", StandardCashFlowDate: "2026-11-25T00:00:00" }),
		release({ FCode: "F003", FName: "ZULMIRA", StandardCashFlowDate: "2026-11-20T00:00:00" }),
		release({ FCode: "F001", FName: "ANA", StandardCashFlowDate: "2026-11-20T00:00:00" }),
	]);

	assert.deepEqual(
		summary.map((s) => [s.FName, s.CashFlowDateKey]),
		[["ANA", "2026-11-20"], ["ZULMIRA", "2026-11-20"], ["JOÃO", "2026-11-25"], ["ZULMIRA", ""]]
	);
});

QUnit.test("lista vazia ou ausente devolve resumo vazio", function (assert) {
	assert.deepEqual(summarizeReleasesBySupplier([]), []);
	assert.deepEqual(summarizeReleasesBySupplier(null), []);
});

QUnit.test("filterReleasesBySupplier devolve só as liberações do fornecedor e da data", function (assert) {
	const rows = [
		release({ ShipmentReleaseKey: "a", FCode: "F001", StandardCashFlowDate: "2026-11-20T00:00:00" }),
		release({ ShipmentReleaseKey: "b", FCode: "F001", StandardCashFlowDate: "2026-11-25T00:00:00" }),
		release({ ShipmentReleaseKey: "c", FCode: "F002", StandardCashFlowDate: "2026-11-20T00:00:00" }),
		release({ ShipmentReleaseKey: "d", FCode: "F001", StandardCashFlowDate: null }),
	];

	assert.deepEqual(
		filterReleasesBySupplier(rows, "F001", "2026-11-20").map((r) => r.ShipmentReleaseKey),
		["a"]
	);
});

QUnit.test("filterReleasesBySupplier com fornecedor e sem data devolve as liberações sem previsão", function (assert) {
	const rows = [
		release({ ShipmentReleaseKey: "a", FCode: "F001", StandardCashFlowDate: "2026-11-20T00:00:00" }),
		release({ ShipmentReleaseKey: "d", FCode: "F001", StandardCashFlowDate: null }),
	];

	assert.deepEqual(
		filterReleasesBySupplier(rows, "F001", undefined).map((r) => r.ShipmentReleaseKey),
		["d"]
	);
});

QUnit.test("filterReleasesBySupplier sem fornecedor (link antigo) devolve tudo", function (assert) {
	const rows = [release({ ShipmentReleaseKey: "a" }), release({ ShipmentReleaseKey: "b", FCode: "F002" })];

	assert.strictEqual(filterReleasesBySupplier(rows, undefined, undefined).length, 2);
	assert.strictEqual(filterReleasesBySupplier(rows, "", "2026-11-20").length, 2);
});
