import {
	ALLOCATION_ORIGINS,
	allocationOriginHighlight,
	allocationOriginText,
	allocationOriginState,
	allocationOriginIcon,
	allocationOriginTooltip,
	parseOriginPurchases
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
	assert.deepEqual(keys, ["Standard", "WarehouseLoss", "DischargeLoss", "DischargeGain", "LoadRefusal", "ReturnRedelivery", "TransshipmentExit"]);
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

QUnit.test("devolução ao armazém devolve o saldo ao contrato (GAC-1214)", function (assert) {
	assert.strictEqual(allocationOriginText("LoadRefusal"), "Devolução");
	assert.strictEqual(
		allocationOriginTooltip("LoadRefusal", null, null, "CG000009"),
		"Carga CG000009 recusada: a devolução ao armazém devolveu o saldo ao contrato.");
	assert.strictEqual(
		allocationOriginTooltip("LoadRefusal", null, null, null),
		"Devolução ao armazém: devolveu o saldo ao contrato.");
});

QUnit.test("reentrega de devolução baixa o contrato de novo (GAC-1214)", function (assert) {
	const origin = ALLOCATION_ORIGINS.find((o) => o.key === "ReturnRedelivery");
	assert.ok(origin, "origem ReturnRedelivery encontrada na lista");
	assert.strictEqual(origin?.legend, "Reentrega de devolução");
	assert.strictEqual(allocationOriginText("ReturnRedelivery"), "Reentrega");
	assert.ok(allocationOriginIcon("ReturnRedelivery").startsWith("sap-icon://"));
	assert.strictEqual(
		allocationOriginTooltip("ReturnRedelivery", null, null, null),
		"Saída pela liberação de devolução: o contrato foi baixado de novo.");
});

QUnit.test("saída de transbordo é informativa e não baixa o contrato (GAC-1233)", function (assert) {
	const origin = ALLOCATION_ORIGINS.find((o) => o.key === "TransshipmentExit");
	assert.strictEqual(origin?.legend, "Saída de transbordo");
	assert.strictEqual(allocationOriginText("TransshipmentExit"), "Transbordo");
	assert.strictEqual(allocationOriginHighlight("TransshipmentExit"), "None");
	assert.strictEqual(allocationOriginState("TransshipmentExit"), "None");
	assert.strictEqual(allocationOriginIcon("TransshipmentExit"), "sap-icon://shipping-status");
	assert.strictEqual(
		allocationOriginTooltip("TransshipmentExit", null, null, null),
		"Saída pela liberação de transbordo: o contrato já foi baixado pelo romaneio de compra.");
});

QUnit.test("compra original da saída de transbordo vira um link por romaneio (GAC-1233)", function (assert) {
	assert.deepEqual(
		parseOriginPurchases("a3d10515-fbe7-46f6-929c-e4fce7092b97", "00017645"),
		[{ key: "a3d10515-fbe7-46f6-929c-e4fce7092b97", code: "00017645" }]);
	assert.deepEqual(
		parseOriginPurchases("k1,k2", "00017645,00017700"),
		[{ key: "k1", code: "00017645" }, { key: "k2", code: "00017700" }]);
});

QUnit.test("linha sem compra original não gera link (GAC-1233)", function (assert) {
	assert.deepEqual(parseOriginPurchases(null, null), []);
	assert.deepEqual(parseOriginPurchases(undefined, undefined), []);
	assert.deepEqual(parseOriginPurchases("", ""), []);
	assert.deepEqual(parseOriginPurchases("k1,", "00017645,"), [{ key: "k1", code: "00017645" }]);
});
