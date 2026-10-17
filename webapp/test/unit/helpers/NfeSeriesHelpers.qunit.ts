import { formatNfeSeries, pickInitialSeries } from "siagrob1/helpers/NfeSeriesHelpers";
import type { NfeSeries } from "siagrob1/helpers/NfeSeriesHelpers";

const list: NfeSeries[] = [
	{ Series: 1, Description: "Normal", NextNumber: 10, IsUsed: true },
	{ Series: 300, Description: "Remessa", NextNumber: 1, IsUsed: false },
];

QUnit.module("NfeSeriesHelpers");

QUnit.test("formatNfeSeries junta série e descrição", function (assert) {
	assert.strictEqual(formatNfeSeries(list[1]), "300 - Remessa");
});

QUnit.test("pickInitialSeries usa a série do documento quando está na lista", function (assert) {
	assert.strictEqual(pickInitialSeries(list, 1, "300"), 300);
});

QUnit.test("pickInitialSeries cai na padrão quando a série do documento não está na lista", function (assert) {
	assert.strictEqual(pickInitialSeries(list, 1, "55"), 1);
});

QUnit.test("pickInitialSeries cai na padrão sem série no documento", function (assert) {
	assert.strictEqual(pickInitialSeries(list, 1, null), 1);
	assert.strictEqual(pickInitialSeries(list, 300), 300);
});

QUnit.test("pickInitialSeries compara pelo número, ignorando zeros à esquerda", function (assert) {
	assert.strictEqual(pickInitialSeries(list, 300, "001"), 1);
});
