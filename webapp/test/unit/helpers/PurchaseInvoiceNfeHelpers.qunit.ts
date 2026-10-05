import {
	canIssuePurchaseNfe, canReturnPurchase, isPurchaseNfeMode, isValidAccessKey, PurchaseNfeState
} from "siagrob1/helpers/PurchaseInvoiceNfeHelpers";

QUnit.module("PurchaseInvoiceNfeHelpers - NF-e do documento de entrada");

const pending: PurchaseNfeState = {
	InvoiceStatus: "Pending", InvoiceType: "Normal", IssuerType: "Own", IsNfeReturn: false, NfeStatus: "None",
};

QUnit.test("modo NF-e só com a regra ativa e emissão própria", function (assert) {
	assert.strictEqual(isPurchaseNfeMode(true, "Own"), true);
	assert.strictEqual(isPurchaseNfeMode(true, "ThirdParty"), false);
	assert.strictEqual(isPurchaseNfeMode(false, "Own"), false);
});

QUnit.test("emite a entrada própria pendente sem NF-e ou rejeitada", function (assert) {
	assert.strictEqual(canIssuePurchaseNfe(pending, true), true);
	assert.strictEqual(canIssuePurchaseNfe({ ...pending, NfeStatus: "Rejected" }, true), true);
	assert.strictEqual(canIssuePurchaseNfe({ ...pending, NfeStatus: "Processing" }, true), false);
	assert.strictEqual(canIssuePurchaseNfe({ ...pending, InvoiceStatus: "Confirmed" }, true), false);
	assert.strictEqual(canIssuePurchaseNfe(pending, false), false);
});

QUnit.test("emite a devolução de compra, não a devolução do cliente", function (assert) {
	assert.strictEqual(canIssuePurchaseNfe({ ...pending, InvoiceType: "Return", IsNfeReturn: true }, true), true);
	assert.strictEqual(canIssuePurchaseNfe({ ...pending, InvoiceType: "Return", IsNfeReturn: false }, true), false);
});

QUnit.test("devolve só a entrada própria Normal, confirmada e autorizada", function (assert) {
	const authorized = { ...pending, InvoiceStatus: "Confirmed", NfeStatus: "Authorized" };
	assert.strictEqual(canReturnPurchase(authorized, true), true);
	assert.strictEqual(canReturnPurchase({ ...authorized, InvoiceType: "Return", IsNfeReturn: true }, true), false);
	assert.strictEqual(canReturnPurchase({ ...authorized, NfeStatus: "None" }, true), false);
	assert.strictEqual(canReturnPurchase(authorized, false), false);
});

QUnit.test("chave de NF-e: 44 dígitos com dígito verificador mod 11", function (assert) {
	assert.strictEqual(isValidAccessKey("35261011222333000181550010000004561123456780"), true);
	assert.strictEqual(isValidAccessKey("3526 1011 2223 3300 0181 5500 1000 0004 5611 2345 6780"), true);
	assert.strictEqual(isValidAccessKey("35261011222333000181550010000004561123456781"), false);
	assert.strictEqual(isValidAccessKey("123"), false);
	assert.strictEqual(isValidAccessKey(""), false);
});
