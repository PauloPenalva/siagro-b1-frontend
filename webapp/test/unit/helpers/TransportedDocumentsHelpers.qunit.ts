import { cteIcmsWarning, normalizeAccessKey } from "siagrob1/helpers/TransportedDocumentsHelpers";

QUnit.module("TransportedDocumentsHelpers - NF-e Referenciada(s) e ICMS do CT-e");

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

QUnit.test("cteIcmsWarning: CST 60 do XML com linha 90/41/40 sem ICMS, e SN com qualquer CST sem ICMS, são compatíveis", function (assert) {
	for (const cst of ["90", "41", "40"]) {
		assert.strictEqual(cteIcmsWarning("60", 0, { CstIcms: cst, IcmsValue: 0 }), "", `60 x ${cst}`);
	}
	assert.strictEqual(cteIcmsWarning("SN", 0, { CstIcms: "00", IcmsValue: 0 }), "", "SN x 00");
	assert.strictEqual(cteIcmsWarning("SN", 0, { CstIcms: "90", IcmsValue: 0 }), "", "SN x 90");
	assert.ok(cteIcmsWarning("60", 0, { CstIcms: "90", IcmsValue: 5 }) !== "", "linha com ICMS continua avisando");
	assert.ok(cteIcmsWarning("60", 0, { CstIcms: "00", IcmsValue: 0 }) !== "", "60 x 00 continua avisando");
});
