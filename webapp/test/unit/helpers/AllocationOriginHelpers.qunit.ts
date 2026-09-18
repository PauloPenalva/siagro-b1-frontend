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
	assert.deepEqual(keys, ["Standard", "WarehouseLoss"]);
	assert.strictEqual(ALLOCATION_ORIGINS[0].legend, "Normal");
});
