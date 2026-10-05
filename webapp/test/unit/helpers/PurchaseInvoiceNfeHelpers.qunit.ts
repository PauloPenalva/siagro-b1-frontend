import {
	buildPurchaseItemNumbers, canIssuePurchaseNfe, canReturnPurchase, canReturnThirdPartyPurchase, isPurchaseNfeMode,
	isPurchaseTaxMode, missingUsageMessage, mustFallBackToNormal, PurchaseNfeState, requiresSupplierKey, supplierNfeAuthorizationText
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

QUnit.test("no modo NF-e a devolução própria manual volta para Normal (é feita pelo Devolver)", function (assert) {
	assert.strictEqual(mustFallBackToNormal("Return", false, true, true), true);
});

QUnit.test("Normal, devolução do Devolver, fora do modo NF-e e tipo já gravado não mudam", function (assert) {
	assert.strictEqual(mustFallBackToNormal("Normal", false, true, true), false, "já é Normal");
	assert.strictEqual(mustFallBackToNormal("Return", true, true, true), false, "devolução nascida do Devolver");
	assert.strictEqual(mustFallBackToNormal("Return", false, false, true), false, "terceiro ou filial sem NF-e");
	assert.strictEqual(mustFallBackToNormal("Return", false, true, false), false, "documento gravado: tipo travado");
});

const thirdParty: PurchaseNfeState = {
	InvoiceStatus: "Confirmed", InvoiceType: "Normal", IssuerType: "ThirdParty", IsNfeReturn: false, NfeStatus: "None",
	ChaveNFe: "35261000052998224725550010000004561123456780",
};

QUnit.test("devolve a entrada de terceiro confirmada, com chave, na filial que emite NF-e", function (assert) {
	assert.strictEqual(canReturnThirdPartyPurchase(thirdParty, true), true);
	assert.strictEqual(canReturnThirdPartyPurchase(thirdParty, false), false, "filial sem NF-e");
	assert.strictEqual(canReturnThirdPartyPurchase({ ...thirdParty, InvoiceStatus: "Pending" }, true), false);
	assert.strictEqual(canReturnThirdPartyPurchase({ ...thirdParty, ChaveNFe: "123" }, true), false);
	assert.strictEqual(canReturnThirdPartyPurchase({ ...thirdParty, InvoiceType: "Return" }, true), false, "devolução do cliente");
	assert.strictEqual(canReturnThirdPartyPurchase({ ...thirdParty, IssuerType: "Own" }, true), false);
});

QUnit.test("número do item: zero quando a linha já tem, o digitado quando falta", function (assert) {
	const rows = [
		{ OriginItemKey: "a", ItemCode: "TRIGO", ItemNumber: 1, TypedItemNumber: null as number },
		{ OriginItemKey: "b", ItemCode: "MILHO", ItemNumber: null, TypedItemNumber: 3 },
	];

	assert.deepEqual(buildPurchaseItemNumbers(rows, ["a", "b"], true), { ok: true, itemNumbers: [0, 3] });
	assert.deepEqual(buildPurchaseItemNumbers(rows.slice(0, 1), ["a"], true), { ok: true, itemNumbers: [0] }, "linha que já tem número");
});

QUnit.test("número do item faltando, fora de 1 a 990 ou repetido é recusado", function (assert) {
	const row = (typed: number) => [
		{ OriginItemKey: "a", ItemCode: "TRIGO", ItemNumber: 1, TypedItemNumber: null as number },
		{ OriginItemKey: "b", ItemCode: "MILHO", ItemNumber: null, TypedItemNumber: typed },
	];

	assert.deepEqual(buildPurchaseItemNumbers(row(null), ["b"], true), { ok: false, message: "Item MILHO: informe o número do item na NF-e do fornecedor." });
	assert.deepEqual(buildPurchaseItemNumbers(row(991), ["b"], true), { ok: false, message: "Item MILHO: informe o número do item na NF-e do fornecedor." });
	assert.deepEqual(buildPurchaseItemNumbers(row(1), ["b"], true), { ok: false, message: "Item MILHO: o número 1 já é de outro item desta NF-e do fornecedor." });
});

QUnit.test("entrada própria: zeros mesmo com linha sem número", function (assert) {
	const rows = [{ OriginItemKey: "b", ItemCode: "MILHO", ItemNumber: null as number, TypedItemNumber: null as number }];

	assert.deepEqual(buildPurchaseItemNumbers(rows, ["b", "x"], false), { ok: true, itemNumbers: [0, 0] });
});

QUnit.test("dois números digitados iguais na mesma devolução: o segundo é recusado", function (assert) {
	const rows = [
		{ OriginItemKey: "a", ItemCode: "TRIGO", ItemNumber: null as number, TypedItemNumber: 5 },
		{ OriginItemKey: "b", ItemCode: "MILHO", ItemNumber: null as number, TypedItemNumber: 5 },
	];

	assert.deepEqual(buildPurchaseItemNumbers(rows, ["a", "b"], true),
		{ ok: false, message: "Item MILHO: o número 5 já é de outro item desta NF-e do fornecedor." });
});

QUnit.test("número do item 0, negativo ou fracionado é recusado", function (assert) {
	const msg = "Item MILHO: informe o número do item na NF-e do fornecedor.";

	for (const typed of [0, -1, 2.5]) {
		const rows = [{ OriginItemKey: "b", ItemCode: "MILHO", ItemNumber: null as number, TypedItemNumber: typed }];

		assert.deepEqual(buildPurchaseItemNumbers(rows, ["b"], true), { ok: false, message: msg }, `digitado ${typed}`);
	}
});

QUnit.test("chave que não está nas linhas dá 0", function (assert) {
	const rows = [{ OriginItemKey: "a", ItemCode: "TRIGO", ItemNumber: 1, TypedItemNumber: null as number }];

	assert.deepEqual(buildPurchaseItemNumbers(rows, ["zzz"], true), { ok: true, itemNumbers: [0] });
});

QUnit.module("PurchaseInvoiceNfeHelpers - terceiro calculado e chave do fornecedor");

QUnit.test("calcula tributos: própria e terceiro Normal na filial ativa", function (assert) {
	assert.strictEqual(isPurchaseTaxMode(true, "Own", "Normal"), true);
	assert.strictEqual(isPurchaseTaxMode(true, "Own", "Return"), true);
	assert.strictEqual(isPurchaseTaxMode(true, "ThirdParty", "Normal"), true);
});

QUnit.test("não calcula: devolução do cliente e filial sem a regra", function (assert) {
	assert.strictEqual(isPurchaseTaxMode(true, "ThirdParty", "Return"), false);
	assert.strictEqual(isPurchaseTaxMode(false, "ThirdParty", "Normal"), false);
	assert.strictEqual(isPurchaseTaxMode(false, "Own", "Normal"), false);
});

QUnit.test("chave obrigatória só no terceiro Normal do tipo NF-e na filial ativa", function (assert) {
	const doc = { IssuerType: "ThirdParty", InvoiceType: "Normal", TaxDocumentKind: "Nfe" };
	assert.strictEqual(requiresSupplierKey(doc, true), true);
	assert.strictEqual(requiresSupplierKey({ ...doc, TaxDocumentKind: "Other" }, true), false);
	assert.strictEqual(requiresSupplierKey({ ...doc, InvoiceType: "Return" }, true), false);
	assert.strictEqual(requiresSupplierKey({ ...doc, IssuerType: "Own" }, true), false);
	assert.strictEqual(requiresSupplierKey(doc, false), false);
});

QUnit.test("texto da autorização na SEFAZ com protocolo e data", function (assert) {
	const text = supplierNfeAuthorizationText("135260000000001", "2026-10-05T12:30:00-03:00");
	assert.ok(text.startsWith("Autorizada na SEFAZ — protocolo 135260000000001 em 05/10/2026"), text);
});

QUnit.test("sem protocolo não há texto; sem data, só o protocolo", function (assert) {
	assert.strictEqual(supplierNfeAuthorizationText(null, null), "");
	assert.strictEqual(supplierNfeAuthorizationText("135260000000001", null), "Autorizada na SEFAZ — protocolo 135260000000001");
});

QUnit.test("mensagem da natureza nomeia o item, um ou vários", function (assert) {
	assert.strictEqual(missingUsageMessage(["TRIGO"]),
		"Informe a natureza de operação do item TRIGO: os tributos da entrada são calculados por ela.");
	assert.strictEqual(missingUsageMessage(["TRIGO", "MILHO"]),
		"Informe a natureza de operação dos itens TRIGO, MILHO: os tributos da entrada são calculados por ela.");
});

QUnit.test("mensagem da natureza: linha sem produto aparece como (sem produto) e código repetido some", function (assert) {
	assert.strictEqual(missingUsageMessage(["", "TRIGO"]),
		"Informe a natureza de operação dos itens (sem produto), TRIGO: os tributos da entrada são calculados por ela.");
	assert.strictEqual(missingUsageMessage([null, "  "]),
		"Informe a natureza de operação do item (sem produto): os tributos da entrada são calculados por ela.");
	assert.strictEqual(missingUsageMessage(["TRIGO", "TRIGO"]),
		"Informe a natureza de operação do item TRIGO: os tributos da entrada são calculados por ela.");
});
