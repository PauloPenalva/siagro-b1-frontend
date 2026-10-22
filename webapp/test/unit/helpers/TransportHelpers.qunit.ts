import {
	licenseState,
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
