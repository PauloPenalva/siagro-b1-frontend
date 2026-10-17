import { cteIcmsWarning, normalizeAccessKey } from "siagrob1/helpers/TransportedDocumentsHelpers";

QUnit.module("TransportedDocumentsHelpers - NF-e transportadas e ICMS do CT-e");

const KEY = "35260112345678000190550010000001231000001236";

QUnit.test("normalizeAccessKey tira espaços e exige 44 dígitos", function (assert) {
	assert.strictEqual(normalizeAccessKey(` ${KEY.slice(0, 22)} ${KEY.slice(22)} `), KEY);
	assert.strictEqual(normalizeAccessKey(KEY.slice(0, 43)), "");
	assert.strictEqual(normalizeAccessKey(undefined), "");
});

QUnit.test("cteIcmsWarning: sem CST no XML ou sem linha não avisa", function (assert) {
	assert.strictEqual(cteIcmsWarning(null, 10, { CstIcms: "00", IcmsValue: 10 }), "");
	assert.strictEqual(cteIcmsWarning("00", 10, undefined), "");
});

QUnit.test("cteIcmsWarning: igual ou dentro de 1 centavo não avisa", function (assert) {
	assert.strictEqual(cteIcmsWarning("00", "12.00", { CstIcms: "00", IcmsValue: "12.00" }), "");
	assert.strictEqual(cteIcmsWarning("00", 12, { CstIcms: "00", IcmsValue: 12.01 }), "");
});

QUnit.test("cteIcmsWarning: CST ou valor diferentes avisam com os dois lados", function (assert) {
	assert.strictEqual(cteIcmsWarning("00", 12, { CstIcms: "20", IcmsValue: 12 }),
		"O ICMS do XML do CT-e (CST 00, R$ 12,00) difere do calculado pela natureza (CST 20, R$ 12,00). Confira a natureza da linha.");
	assert.ok(cteIcmsWarning("00", 12, { CstIcms: "00", IcmsValue: 12.5 }).includes("R$ 12,50"));
});
