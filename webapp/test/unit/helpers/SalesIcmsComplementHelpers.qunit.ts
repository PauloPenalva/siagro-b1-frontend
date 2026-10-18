import { complementRowsFrom, buildIcmsComplementPayload, canComplementIcms, IcmsComplementRow } from "siagrob1/helpers/SalesIcmsComplementHelpers";

function row(overrides: Partial<IcmsComplementRow> = {}): IcmsComplementRow {
	return { OriginItemKey: "k1", ItemCode: "1", ItemName: "TRIGO", Quantity: 10, Total: 100, IcmsBase: 0, IcmsValue: 0, ...overrides };
}

QUnit.module("SalesIcmsComplementHelpers");

QUnit.test("complementRowsFrom abre as linhas com base e ICMS zerados", function (assert) {
	const rows = complementRowsFrom([{ Key: "a", ItemCode: "1", ItemName: "TRIGO", Quantity: 5, Total: 50 }]);
	assert.strictEqual(rows.length, 1);
	assert.strictEqual(rows[0].OriginItemKey, "a");
	assert.strictEqual(rows[0].IcmsBase, 0);
	assert.strictEqual(rows[0].IcmsValue, 0);
	assert.strictEqual(rows[0].Total, 50);
});

QUnit.test("payload deixa de fora a linha com base e valor zerados e mantém os arrays paralelos na ordem", function (assert) {
	const payload = buildIcmsComplementPayload([
		row({ OriginItemKey: "k1", IcmsBase: 100, IcmsValue: 12 }),
		row({ OriginItemKey: "k2" }),
		row({ OriginItemKey: "k3", IcmsBase: 0, IcmsValue: 5 }),
		row({ OriginItemKey: "k4", IcmsBase: 7, IcmsValue: 0 }),
	]);
	assert.deepEqual(payload.OriginItemKeys, ["k1", "k3", "k4"]);
	assert.deepEqual(payload.IcmsBases, [100, 0, 7]);
	assert.deepEqual(payload.IcmsValues, [12, 5, 0]);
});

QUnit.test("payload trata null/undefined/texto inválido como zero", function (assert) {
	const payload = buildIcmsComplementPayload([
		row({ IcmsBase: null, IcmsValue: undefined }),
		row({ OriginItemKey: "k2", IcmsBase: "abc" as unknown as number, IcmsValue: 3 }),
	]);
	assert.deepEqual(payload.OriginItemKeys, ["k2"]);
	assert.deepEqual(payload.IcmsBases, [0]);
	assert.deepEqual(payload.IcmsValues, [3]);
});

QUnit.test("canComplementIcms só vale para venda Normal, Confirmada, NF-e Autorizada, Kind Nfe e regra fiscal ativa", function (assert) {
	const ok = { InvoiceType: "Normal", InvoiceStatus: "Confirmed", NfeStatus: "Authorized", TaxDocumentKind: "Nfe", taxLocked: true };
	assert.strictEqual(canComplementIcms(ok), true);
	assert.strictEqual(canComplementIcms({ ...ok, InvoiceType: "Return" }), false);
	assert.strictEqual(canComplementIcms({ ...ok, InvoiceType: "IcmsComplement" }), false);
	assert.strictEqual(canComplementIcms({ ...ok, InvoiceStatus: "Pending" }), false);
	assert.strictEqual(canComplementIcms({ ...ok, NfeStatus: "Pending" }), false);
	assert.strictEqual(canComplementIcms({ ...ok, TaxDocumentKind: "Other" }), false);
	assert.strictEqual(canComplementIcms({ ...ok, taxLocked: false }), false);
	assert.strictEqual(canComplementIcms(null), false);
});
