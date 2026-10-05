import { blankItemRow, draftItemRows } from "siagrob1/helpers/PurchaseInvoiceDraftHelpers";

QUnit.module("PurchaseInvoiceDraftHelpers - linhas do rascunho da entrada");

QUnit.test("digitação manual começa com uma única linha em branco", function (assert) {
	assert.deepEqual(draftItemRows(undefined), [blankItemRow()]);
});

QUnit.test("a linha em branco já traz as chaves que a tela edita, nulas", function (assert) {
	assert.deepEqual(blankItemRow(), {
		ItemCode: "", ItemName: "", UnitOfMeasureCode: "", Quantity: 0, UnitPrice: 0,
		SalesInvoiceItemKey: null, PurchaseContractKey: null, UsageCode: null, UsageName: null,
		NfeItemNumber: null,
	});
});

QUnit.test("XML importado vira uma linha por item, na ordem do XML", function (assert) {
	const rows = draftItemRows([
		{ ItemCode: "TRIGO", ItemName: "TRIGO EM GRAOS", UnitOfMeasureCode: "KG", Quantity: 1000, UnitPrice: 1.5 },
		{ ItemCode: "MILHO", ItemName: "MILHO EM GRAOS", UnitOfMeasureCode: "SC", Quantity: null, UnitPrice: null },
	]);

	assert.deepEqual(rows.map((row) => [row.ItemCode, row.UnitOfMeasureCode, row.Quantity, row.UnitPrice]),
		[["TRIGO", "KG", 1000, 1.5], ["MILHO", "SC", 0, 0]]);
	assert.deepEqual(rows.map((row) => [row.SalesInvoiceItemKey, row.PurchaseContractKey, row.UsageCode, row.UsageName]),
		[[null, null, null, null], [null, null, null, null]]);
});

QUnit.test("XML importado leva o nItem do fornecedor em cada linha", function (assert) {
	const rows = draftItemRows([
		{ ItemCode: "TRIGO", ItemName: "TRIGO", UnitOfMeasureCode: "KG", Quantity: 1, UnitPrice: 1, NfeItemNumber: 1 },
		{ ItemCode: "MILHO", ItemName: "MILHO", UnitOfMeasureCode: "KG", Quantity: 1, UnitPrice: 1, NfeItemNumber: 2 },
	]);

	assert.deepEqual(rows.map((row) => row.NfeItemNumber), [1, 2]);
});
