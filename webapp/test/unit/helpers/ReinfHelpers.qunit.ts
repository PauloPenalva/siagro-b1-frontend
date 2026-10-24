import {
	reinfSituationState, reinfPeriodStatusText, reinfPreviousPeriod, reinfPeriodActions, reinfPendingBatchKeys, pascalKeys, reinfRegistrationText,
} from "siagrob1/helpers/ReinfHelpers";

QUnit.module("ReinfHelpers");

QUnit.test("situação da linha: cor por situação", function (assert) {
	assert.strictEqual(reinfSituationState("Aceito"), "Success");
	assert.strictEqual(reinfSituationState("Rejeitado"), "Error");
	assert.strictEqual(reinfSituationState("Desatualizado"), "Warning");
	assert.strictEqual(reinfSituationState("Excluir"), "Warning");
	assert.strictEqual(reinfSituationState("Excluído"), "None");
	assert.strictEqual(reinfSituationState("Novo"), "Information");
	assert.strictEqual(reinfSituationState("Enviado"), "Information");
	assert.strictEqual(reinfSituationState(undefined), "None");
	assert.strictEqual(reinfSituationState("Outra"), "None");
});

QUnit.test("situação do período e botões", function (assert) {
	assert.strictEqual(reinfPeriodStatusText("Closed"), "Fechado");
	assert.strictEqual(reinfPeriodStatusText(""), "Aberto");
	assert.deepEqual(reinfPeriodActions("Open", true), { canTransmit: true, canClose: true, canReopen: false });
	assert.deepEqual(reinfPeriodActions("Closed", true), { canTransmit: false, canClose: false, canReopen: true });
	assert.deepEqual(reinfPeriodActions("Closing", false), { canTransmit: false, canClose: false, canReopen: false });
});

QUnit.test("lotes pendentes sem repetição", function (assert) {
	const keys = reinfPendingBatchKeys([
		{ BatchKey: "a", BatchStatus: "Sent" }, { BatchKey: "a", BatchStatus: "Sent" },
		{ BatchKey: "b", BatchStatus: "Processed" }, { BatchKey: "c", BatchStatus: "Processing" }, { BatchKey: null },
	]);
	assert.deepEqual(keys, ["a", "c"]);
});

QUnit.test("normaliza chaves e textos do R-1000", function (assert) {
	assert.deepEqual(pascalKeys({ "@odata.context": "x", taxIdRoot: "1", Name: "n" }), { TaxIdRoot: "1", Name: "n" });
	assert.strictEqual(reinfRegistrationText(2), "Aceito");
});

QUnit.test("mês anterior sem estouro no fim do mês", function (assert) {
	assert.strictEqual(reinfPreviousPeriod(new Date(2026, 2, 31)), "2026-02");
	assert.strictEqual(reinfPreviousPeriod(new Date(2026, 0, 15)), "2025-12");
	assert.strictEqual(reinfPreviousPeriod(new Date(2026, 9, 24)), "2026-09");
});
