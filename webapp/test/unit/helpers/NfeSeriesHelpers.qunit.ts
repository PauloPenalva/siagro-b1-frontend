import { abandonedReservationWarning, buildSeriesSavePayload, followDefaultSeries, formatNfeSeries, hasBlankSeriesRow, pickInitialSeries } from "siagrob1/helpers/NfeSeriesHelpers";
import type { NfeSeries, NfeSeriesRow } from "siagrob1/helpers/NfeSeriesHelpers";

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

QUnit.test("buildSeriesSavePayload converte strings em números, apara a descrição e mantém a ordem", function (assert) {
	const rows = [
		{ Series: "300", Description: "  Remessa  ", NextNumber: "5", IsUsed: false, isNew: true },
		{ Series: 1, Description: "Normal", NextNumber: 10, IsUsed: true, isNew: false },
	] as unknown as NfeSeriesRow[];

	assert.deepEqual(buildSeriesSavePayload(rows), {
		Series: [300, 1],
		Descriptions: ["Remessa", "Normal"],
		NextNumbers: [5, 10],
	});
});

QUnit.test("buildSeriesSavePayload com lista vazia devolve vetores vazios", function (assert) {
	assert.deepEqual(buildSeriesSavePayload([]), { Series: [], Descriptions: [], NextNumbers: [] });
});

QUnit.test("abandonedReservationWarning avisa quando a série muda e o documento já tem número reservado", function (assert) {
	assert.strictEqual(abandonedReservationWarning("1", "25", 300),
		"O nº 25 da série 1, reservado para este documento, ficará sem uso e precisará ser inutilizado.");
});

QUnit.test("abandonedReservationWarning não avisa sem número, sem série ou com a mesma série", function (assert) {
	assert.strictEqual(abandonedReservationWarning("1", "", 300), "");
	assert.strictEqual(abandonedReservationWarning("1", undefined, 300), "");
	assert.strictEqual(abandonedReservationWarning("", "25", 300), "");
	assert.strictEqual(abandonedReservationWarning("009", "25", 9), "");
});

QUnit.test("hasBlankSeriesRow detecta série ou próximo número em branco", function (assert) {
	const ok = { Description: "", IsUsed: false, isNew: true };
	assert.strictEqual(hasBlankSeriesRow([]), false);
	assert.strictEqual(hasBlankSeriesRow([{ ...ok, Series: 1, NextNumber: 5 }, { ...ok, Series: "0" as unknown as number, NextNumber: 1 }]), false);
	assert.strictEqual(hasBlankSeriesRow([{ ...ok, Series: "" as unknown as number, NextNumber: 5 }]), true);
	assert.strictEqual(hasBlankSeriesRow([{ ...ok, Series: "  " as unknown as number, NextNumber: 5 }]), true);
	assert.strictEqual(hasBlankSeriesRow([{ ...ok, Series: 1, NextNumber: "" as unknown as number }]), true);
	assert.strictEqual(hasBlankSeriesRow([{ ...ok, Series: 1, NextNumber: undefined }]), true);
});

QUnit.test("followDefaultSeries acompanha a edição da série que era a padrão", function (assert) {
	assert.strictEqual(followDefaultSeries(0, "", "7"), 7);
	assert.strictEqual(followDefaultSeries(3, "3", "30"), 30);
	assert.strictEqual(followDefaultSeries(1, "", "7"), 1);
	assert.strictEqual(followDefaultSeries(1, "2", "7"), 1);
});
