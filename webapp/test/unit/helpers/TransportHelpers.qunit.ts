import {
	ACTIVE_TRACTION_TRUCKS_FILTER,
	ACTIVE_TRAILERS_FILTER,
	buildCombinationSavePayload,
	licenseState,
	trailersText,
	truckBodyTypeText,
	truckKindText,
	truckWheelTypeText,
} from "siagrob1/helpers/TransportHelpers";

QUnit.module("TransportHelpers - veículo e motorista");

const day = (offset: number): Date => {
	const d = new Date(2026, 9, 22);
	d.setDate(d.getDate() + offset);
	return d;
};
const TODAY = day(0);

QUnit.test("filtros de escolha: só tração ativa / só reboque ativo, como string crua (enum)", function (assert) {
	assert.strictEqual(ACTIVE_TRACTION_TRUCKS_FILTER, "Kind eq 'Traction' and Inactive eq false");
	assert.strictEqual(ACTIVE_TRAILERS_FILTER, "Kind eq 'Trailer' and Inactive eq false");
});

QUnit.test("buildCombinationSavePayload descarta reboque vazio e manda driver vazio como null", function (assert) {
	const payload = buildCombinationSavePayload({
		IsNew: true, Code: " bitrem01 ", Description: " Bitrem ", TractionTruckCode: "CAV1A11",
		DefaultDriverCode: "", Inactive: false,
		Trailers: [{ TrailerTruckCode: "CAR1C33" }, { TrailerTruckCode: " " }, { TrailerTruckCode: "car2d44" }],
	});

	assert.deepEqual(payload, {
		IsNew: true, Code: "BITREM01", Description: "Bitrem", TractionTruckCode: "CAV1A11",
		DefaultDriverCode: null, Inactive: false, TrailerCodes: ["CAR1C33", "CAR2D44"],
	});
});

QUnit.test("trailersText junta as placas na ordem da posição", function (assert) {
	assert.strictEqual(trailersText([
		{ Position: 2, TrailerTruckCode: "CAR2D44" }, { Position: 1, TrailerTruckCode: "CAR1C33" },
	]), "CAR1C33, CAR2D44");
	assert.strictEqual(trailersText(undefined), "");
});

QUnit.test("truckKindText traduz tração e reboque", function (assert) {
	assert.strictEqual(truckKindText("Traction"), "Tração");
	assert.strictEqual(truckKindText("Trailer"), "Reboque");
	assert.strictEqual(truckKindText(null), "");
});

QUnit.test("truckWheelTypeText e truckBodyTypeText mostram código oficial e nome", function (assert) {
	assert.strictEqual(truckWheelTypeText("TractorUnit"), "03 - Cavalo mecânico");
	assert.strictEqual(truckBodyTypeText("ClosedBox"), "02 - Fechada/Baú");
	assert.strictEqual(truckWheelTypeText(undefined), "");
	assert.strictEqual(truckBodyTypeText("Desconhecido"), "Desconhecido");
});

QUnit.test("licenseState: vencida é Error", function (assert) {
	assert.strictEqual(licenseState(day(-1), TODAY), "Error");
});

QUnit.test("licenseState: vence em até 30 dias é Warning", function (assert) {
	assert.strictEqual(licenseState(day(10), TODAY), "Warning");
	assert.strictEqual(licenseState(day(0), TODAY), "Warning");
	assert.strictEqual(licenseState(day(30), TODAY), "Warning");
});

QUnit.test("licenseState: mais de 30 dias ou sem data é None", function (assert) {
	assert.strictEqual(licenseState(day(31), TODAY), "None");
	assert.strictEqual(licenseState(null, TODAY), "None");
});

QUnit.test("licenseState aceita a data do OData (yyyy-MM-dd) sem fuso", function (assert) {
	assert.strictEqual(licenseState("2026-10-21", TODAY), "Error");
	assert.strictEqual(licenseState("2026-10-22", TODAY), "Warning");
	assert.strictEqual(licenseState("2026-12-31", TODAY), "None");
});
