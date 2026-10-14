import { blankItemRow, draftItemRows, missingUnitOfMeasureMessage, suggestedUnitOfMeasure, toNumber, unitSuggestionToApply } from "siagrob1/helpers/PurchaseInvoiceDraftHelpers";

QUnit.module("PurchaseInvoiceDraftHelpers - linhas do rascunho da entrada");

QUnit.test("digitação manual começa com uma única linha em branco", function (assert) {
	assert.deepEqual(draftItemRows(undefined), [blankItemRow()]);
});

QUnit.test("a linha em branco já traz as chaves que a tela edita, nulas", function (assert) {
	assert.deepEqual(blankItemRow(), {
		ItemCode: "", ItemName: "", UnitOfMeasureCode: "", Quantity: 0, UnitPrice: 0,
		SalesInvoiceItemKey: null, PurchaseContractKey: null, UsageCode: null, UsageName: null,
		NfeItemNumber: null, FreightValue: 0, InsuranceValue: 0, DiscountValue: 0, OtherExpensesValue: 0,
		ComplementAmount: 0,
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

QUnit.test("a action devolve Edm.Decimal como string: as linhas levam número", function (assert) {
	const rows = draftItemRows([
		{ ItemCode: "TRIGO", ItemName: "TRIGO", UnitOfMeasureCode: "KG", Quantity: "2000.0000", UnitPrice: "1.4000000000" },
	]);

	assert.strictEqual(rows[0].Quantity, 2000);
	assert.strictEqual(rows[0].UnitPrice, 1.4);
});

QUnit.test("toNumber converte string decimal e zera nulo, vazio e não numérico", function (assert) {
	assert.strictEqual(toNumber("2800.00"), 2800);
	assert.strictEqual(toNumber(12.5), 12.5);
	assert.strictEqual(toNumber(null), 0);
	assert.strictEqual(toNumber(undefined), 0);
	assert.strictEqual(toNumber(""), 0);
	assert.strictEqual(toNumber("  "), 0);
	assert.strictEqual(toNumber("abc"), 0);
});

QUnit.test("XML importado leva frete, seguro, desconto e outras despesas da linha, em número", function (assert) {
	const rows = draftItemRows([
		{
			ItemCode: "TRIGO", ItemName: "TRIGO", UnitOfMeasureCode: "KG", Quantity: "1000.0000", UnitPrice: "1.5000000000",
			FreightValue: "100.00", InsuranceValue: "20.00", DiscountValue: "50.00", OtherExpensesValue: "30.00",
		},
		{ ItemCode: "MILHO", ItemName: "MILHO", UnitOfMeasureCode: "KG", Quantity: 1, UnitPrice: 1 },
	]);

	assert.deepEqual(rows.map((row) => [row.FreightValue, row.InsuranceValue, row.DiscountValue, row.OtherExpensesValue]),
		[[100, 20, 50, 30], [0, 0, 0, 0]]);
});

QUnit.test("NF-e de complemento importada leva o valor do complemento em número, sem quantidade (spec D11)", function (assert) {
	const rows = draftItemRows([
		{ ItemCode: "TRIGO", ItemName: "TRIGO", UnitOfMeasureCode: "KG", Quantity: "0", UnitPrice: "0", ComplementAmount: "271.67" },
	]);

	assert.deepEqual(rows.map((row) => [row.Quantity, row.UnitPrice, row.ComplementAmount]), [[0, 0, 271.67]]);
});

QUnit.module("PurchaseInvoiceDraftHelpers - unidade de medida da linha (B7)");

QUnit.test("a unidade já escolhida nunca é trocada", function (assert) {
	assert.strictEqual(suggestedUnitOfMeasure("SC", "KG", "UN"), "SC");
});

QUnit.test("sem unidade, vale a comercial do produto e depois a padrão do sistema", function (assert) {
	assert.strictEqual(suggestedUnitOfMeasure("", "KG", "UN"), "KG");
	assert.strictEqual(suggestedUnitOfMeasure(undefined, "  ", "UN"), "UN");
	assert.strictEqual(suggestedUnitOfMeasure(null, null, undefined), "");
});

QUnit.test("o Save nomeia a primeira linha sem unidade pela posição na grade", function (assert) {
	assert.strictEqual(
		missingUnitOfMeasureMessage([{ ItemCode: "SOJA", UnitOfMeasureCode: "KG" }, { ItemCode: "MILHO", UnitOfMeasureCode: " " }]),
		"Informe a unidade de medida da linha 2 (MILHO).");
	assert.strictEqual(missingUnitOfMeasureMessage([{ ItemCode: "SOJA", UnitOfMeasureCode: "KG" }]), "");
});

QUnit.test("complemento de valor não exige unidade", function (assert) {
	assert.strictEqual(missingUnitOfMeasureMessage([{ ItemCode: "SOJA" }], "ValueComplement"), "");
});

QUnit.test("sugestão de produto que já foi trocado é descartada", function (assert) {
	assert.strictEqual(unitSuggestionToApply("SOJA", "MILHO", "", "", "KG", "UN"), "");
});

QUnit.test("a unidade escolhida à mão não é sobrescrita; a sugerida anteriormente é renovada", function (assert) {
	assert.strictEqual(unitSuggestionToApply("MILHO", "MILHO", "SC", "KG", "TON", "UN"), "", "escolhida à mão");
	assert.strictEqual(unitSuggestionToApply("MILHO", "MILHO", "KG", "KG", "SC", "UN"), "SC", "sugestão renovada");
	assert.strictEqual(unitSuggestionToApply("MILHO", "MILHO", "", "KG", undefined, "UN"), "UN", "vazia usa a padrão");
	assert.strictEqual(unitSuggestionToApply("MILHO", "MILHO", "SC", "", "KG", "UN"), "", "sem sugestão anterior, a unidade existente é do operador");
});
