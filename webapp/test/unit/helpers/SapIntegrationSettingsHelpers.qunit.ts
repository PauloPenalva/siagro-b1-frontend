import { normalizeSapIntegrationSettings, isValidSyncInterval, formatLastRunText } from "siagrob1/helpers/SapIntegrationSettingsHelpers";
import formatter from "siagrob1/model/formatter";

QUnit.module("SapIntegrationSettingsHelpers");

QUnit.test("normaliza PascalCase e camelCase", function (assert) {
	const expected = { InvoiceSyncEnabled: true, InvoiceSyncIntervalMinutes: 30, InvoiceSyncLastRunAt: "2026-11-16T10:00:00Z" };
	assert.deepEqual(normalizeSapIntegrationSettings(
		{ InvoiceSyncEnabled: true, InvoiceSyncIntervalMinutes: 30, InvoiceSyncLastRunAt: "2026-11-16T10:00:00Z" }), expected, "Pascal");
	assert.deepEqual(normalizeSapIntegrationSettings(
		{ invoiceSyncEnabled: true, invoiceSyncIntervalMinutes: 30, invoiceSyncLastRunAt: "2026-11-16T10:00:00Z" }), expected, "camel");
});

QUnit.test("resposta vazia vira padrão desligado e sem última execução", function (assert) {
	assert.deepEqual(normalizeSapIntegrationSettings(undefined),
		{ InvoiceSyncEnabled: false, InvoiceSyncIntervalMinutes: 15, InvoiceSyncLastRunAt: null });
	assert.strictEqual(normalizeSapIntegrationSettings({ InvoiceSyncLastRunAt: null }).InvoiceSyncLastRunAt, null);
});

QUnit.test("intervalo válido vai de 1 a 1440, inteiro", function (assert) {
	assert.strictEqual(isValidSyncInterval(1), true);
	assert.strictEqual(isValidSyncInterval(1440), true);
	assert.strictEqual(isValidSyncInterval("30"), true);
	assert.strictEqual(isValidSyncInterval(0), false);
	assert.strictEqual(isValidSyncInterval(1441), false);
	assert.strictEqual(isValidSyncInterval(1.5), false);
	assert.strictEqual(isValidSyncInterval(""), false);
	assert.strictEqual(isValidSyncInterval(undefined), false);
});

QUnit.test("última execução: Nunca sem data, data e hora formatadas com data", function (assert) {
	assert.strictEqual(formatLastRunText(null), "Nunca");
	assert.strictEqual(formatLastRunText(undefined), "Nunca");
	assert.strictEqual(formatLastRunText(""), "Nunca");
	const value = "2026-11-16T10:05:00";
	assert.strictEqual(formatLastRunText(value), formatter.formatDateTime(value));
	assert.ok(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(formatLastRunText(value)), "dd/MM/yyyy HH:mm");
});
