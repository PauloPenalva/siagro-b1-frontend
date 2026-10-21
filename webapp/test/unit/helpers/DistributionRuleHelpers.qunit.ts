import type { RuleVersion } from "siagrob1/helpers/DistributionRuleHelpers";
import {
	sumPercentages, isTotalValid, isVersionEditable, versionStatus, todayInBrasilia,
	normalizeRule, buildSaveVersionBody, buildCreateRuleBody, formatIsoDateBr, versionStatusText
} from "siagrob1/helpers/DistributionRuleHelpers";

QUnit.module("DistributionRuleHelpers - regras de distribuição");

QUnit.test("sumPercentages soma sem ruído de ponto flutuante", function (assert) {
	assert.strictEqual(sumPercentages([{ CostCenterCode: "A", Percentage: 33.3 }, { CostCenterCode: "B", Percentage: 66.7 }]), 100);
	assert.strictEqual(sumPercentages([{ CostCenterCode: "A", Percentage: 0.1 }, { CostCenterCode: "B", Percentage: 0.2 }]), 0.3);
	assert.strictEqual(sumPercentages([{ CostCenterCode: "A", Percentage: null }]), 0, "vazio conta zero");
});

QUnit.test("isTotalValid exige exatamente 100", function (assert) {
	assert.strictEqual(isTotalValid([{ CostCenterCode: "A", Percentage: 50 }, { CostCenterCode: "B", Percentage: 50 }]), true);
	assert.strictEqual(isTotalValid([{ CostCenterCode: "A", Percentage: 99.99 }]), false);
});

QUnit.test("isVersionEditable: só depois de hoje", function (assert) {
	assert.strictEqual(isVersionEditable("2026-10-22", "2026-10-21"), true);
	assert.strictEqual(isVersionEditable("2026-10-21", "2026-10-21"), false, "hoje já é vigente");
	assert.strictEqual(isVersionEditable("2026-01-01", "2026-10-21"), false);
	assert.strictEqual(isVersionEditable("", "2026-10-21"), false);
});

QUnit.test("versionStatus separa vigente, passada e futura", function (assert) {
	const versions: RuleVersion[] = [
		{ ValidFrom: "2026-01-01", Lines: [] },
		{ ValidFrom: "2026-06-01", Lines: [] },
		{ ValidFrom: "2026-12-01", Lines: [] }
	];
	assert.strictEqual(versionStatus(versions, "2026-01-01", "2026-10-21"), "Past");
	assert.strictEqual(versionStatus(versions, "2026-06-01", "2026-10-21"), "Current");
	assert.strictEqual(versionStatus(versions, "2026-12-01", "2026-10-21"), "Future");
});

QUnit.test("todayInBrasilia usa o dia de Brasília, não o UTC", function (assert) {
	// 22/10 01:30 UTC ainda é 21/10 22:30 em Brasília.
	assert.strictEqual(todayInBrasilia(new Date(Date.UTC(2026, 9, 22, 1, 30))), "2026-10-21");
	assert.strictEqual(todayInBrasilia(new Date(Date.UTC(2026, 9, 22, 12, 0))), "2026-10-22");
});

QUnit.test("normalizeRule aceita camelCase e ordena versões", function (assert) {
	const rule = normalizeRule({
		code: "FROTA", name: "Frota", dimensionNumber: 2, inactive: false,
		versions: [
			{ id: "b", validFrom: "2026-12-01T00:00:00", lines: [{ costCenterCode: "CAM01", percentage: 100 }] },
			{ id: "a", validFrom: "2026-01-01", lines: [] }
		]
	});
	assert.strictEqual(rule.Code, "FROTA");
	assert.strictEqual(rule.DimensionNumber, 2);
	assert.deepEqual(rule.Versions.map(v => v.ValidFrom), ["2026-01-01", "2026-12-01"]);
	assert.strictEqual(rule.Versions[1].Lines[0].Percentage, 100);
});

QUnit.test("buildSaveVersionBody monta arrays paralelos", function (assert) {
	const body = buildSaveVersionBody("FROTA", "2026-12-01", [
		{ CostCenterCode: " cam01 ", Percentage: 50 }, { CostCenterCode: "CAM02", Percentage: 50 }
	]);
	assert.deepEqual(body.LineCostCenterCodes, ["CAM01", "CAM02"]);
	assert.deepEqual(body.LinePercentages, [50, 50]);
});

QUnit.test("buildCreateRuleBody leva a primeira versão", function (assert) {
	const body = buildCreateRuleBody({ Code: "frota", Name: "Frota", DimensionNumber: 2 }, "2026-10-01",
		[{ CostCenterCode: "CAM01", Percentage: 100 }]);
	assert.strictEqual(body.Code, "FROTA");
	assert.strictEqual(body.Versions.length, 1);
	assert.strictEqual(body.Versions[0].RuleCode, "FROTA", "versão aninhada leva RuleCode");
	assert.strictEqual(body.Versions[0].Lines[0].Percentage, 100);
});

QUnit.test("formatIsoDateBr e versionStatusText", function (assert) {
	assert.strictEqual(formatIsoDateBr("2026-10-01"), "01/10/2026");
	assert.strictEqual(formatIsoDateBr(""), "");
	assert.strictEqual(versionStatusText("Current"), "Vigente");
	assert.strictEqual(versionStatusText("Future"), "Futura");
});
