import {
	ALLOCATION_ORIGINS,
	allocationOriginHighlight,
	allocationOriginText,
	allocationOriginState,
	allocationOriginIcon,
	allocationOriginTooltip
} from "siagrob1/helpers/AllocationOriginHelpers";

QUnit.module("AllocationOriginHelpers - origem da entrega do contrato (GAC-1164)");

QUnit.test("romaneio normal não ganha faixa nem texto de origem", function (assert) {
	assert.strictEqual(allocationOriginHighlight("Standard"), "None");
	assert.strictEqual(allocationOriginText("Standard"), "");
	assert.strictEqual(allocationOriginIcon("Standard"), "");
});

QUnit.test("origem ausente (backend antigo) é tratada como normal", function (assert) {
	assert.strictEqual(allocationOriginHighlight(undefined), "None");
	assert.strictEqual(allocationOriginHighlight(null), "None");
	assert.strictEqual(allocationOriginText(undefined), "");
});

QUnit.test("perda de conferência de armazém é destacada em laranja", function (assert) {
	assert.strictEqual(allocationOriginHighlight("WarehouseLoss"), "Warning");
	assert.strictEqual(allocationOriginState("WarehouseLoss"), "Warning");
	assert.strictEqual(allocationOriginText("WarehouseLoss"), "Perda de armazém");
	assert.ok(allocationOriginIcon("WarehouseLoss").startsWith("sap-icon://"));
});

QUnit.test("origem desconhecida não quebra a tabela", function (assert) {
	assert.strictEqual(allocationOriginHighlight("SomethingNew"), "None");
	assert.strictEqual(allocationOriginText("SomethingNew"), "");
});

QUnit.test("tooltip cita o número da conferência só na perda", function (assert) {
	assert.strictEqual(allocationOriginTooltip("WarehouseLoss", "CS000004"), "Conferência de saldo de armazém CS000004");
	assert.strictEqual(allocationOriginTooltip("Standard", null), "");
});

QUnit.test("a legenda lista cada origem uma vez, começando pela normal", function (assert) {
	const keys = ALLOCATION_ORIGINS.map((o) => o.key);
	assert.deepEqual(keys, ["Standard", "WarehouseLoss", "DischargeLoss", "DischargeGain"]);
	assert.strictEqual(ALLOCATION_ORIGINS[0].legend, "Normal");
});

QUnit.test("quebra de descarga (troca nota) é destacada em vermelho", function (assert) {
	assert.strictEqual(allocationOriginHighlight("DischargeLoss"), "Error");
	assert.strictEqual(allocationOriginState("DischargeLoss"), "Error");
	assert.strictEqual(allocationOriginText("DischargeLoss"), "Quebra de descarga");
	assert.ok(allocationOriginIcon("DischargeLoss").startsWith("sap-icon://"));
});

QUnit.test("sobra de descarga (troca nota) é destacada em verde", function (assert) {
	assert.strictEqual(allocationOriginHighlight("DischargeGain"), "Success");
	assert.strictEqual(allocationOriginText("DischargeGain"), "Sobra de descarga");
});

QUnit.test("tooltip da descarga cita a nota de venda e a carga", function (assert) {
	assert.strictEqual(
		allocationOriginTooltip("DischargeLoss", null, "000002376", "CG000009"),
		"Conferência da nota 000002376 (carga CG000009)");
	assert.strictEqual(allocationOriginTooltip("DischargeGain", null, "000002376", null), "Conferência da nota 000002376");
	assert.strictEqual(allocationOriginTooltip("DischargeLoss", null, null, null), "");
});
