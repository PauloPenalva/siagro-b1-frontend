import {
	blankItemRow, complementedItemLabel, complementedItemLabels, complementLineFrom, draftItemRows, formatComplementedItem,
	formatContractCode, inheritedContracts, isLineContractEditable, isOtherPurchaseDocument, isOtherPurchaseEligible,
	missingUnitOfMeasureMessage, suggestedUnitOfMeasure, toNumber,
	unitSuggestionToApply, withEntry
} from "siagrob1/helpers/PurchaseInvoiceDraftHelpers";
import { PurchaseInvoiceComplementCandidate } from "siagrob1/types/PurchaseInvoiceComplementCandidate";

QUnit.module("PurchaseInvoiceDraftHelpers - linhas do rascunho da entrada");

QUnit.test("digitação manual começa com uma única linha em branco", function (assert) {
	assert.deepEqual(draftItemRows(undefined), [blankItemRow()]);
});

QUnit.test("a linha em branco já traz as chaves que a tela edita, nulas", function (assert) {
	assert.deepEqual(blankItemRow(), {
		ItemCode: "", ItemName: "", UnitOfMeasureCode: "", Quantity: 0, UnitPrice: 0,
		SalesInvoiceItemKey: null, PurchaseContractKey: null, UsageCode: null, UsageName: null,
		NfeItemNumber: null, FreightValue: 0, InsuranceValue: 0, DiscountValue: 0, OtherExpensesValue: 0,
		ComplementAmount: 0, ComplementedItemKey: null, IcmsBase: 0, IcmsValue: 0,
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

QUnit.test("XML do complemento de ICMS leva base e valor do ICMS em número, sem quantidade", function (assert) {
	const rows = draftItemRows([
		{ ItemCode: "TRIGO", ItemName: "TRIGO", UnitOfMeasureCode: "KG", Quantity: "0", UnitPrice: "0", IcmsBase: "1000.5", IcmsValue: "120.06" },
		{ ItemCode: "MILHO", ItemName: "MILHO", UnitOfMeasureCode: "KG", Quantity: "0", UnitPrice: "0" },
	]);

	assert.deepEqual(rows.map((row) => [row.Quantity, row.UnitPrice, row.ComplementAmount, row.IcmsBase, row.IcmsValue]),
		[[0, 0, 0, 1000.5, 120.06], [0, 0, 0, 0, 0]]);
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
	assert.strictEqual(missingUnitOfMeasureMessage([{ ItemCode: "SOJA" }], "IcmsComplement"), "");
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

QUnit.module("PurchaseInvoiceDraftHelpers - complemento de valor próprio (spec 2026-10-14)");

const candidate: PurchaseInvoiceComplementCandidate = {
	ItemKey: "item-1", InvoiceKey: "nota-5", InvoiceNumber: "DE000005", InvoiceDate: "2026-10-01T00:00:00",
	AccessKey: "3526", LineNumber: 1, ItemCode: "TRIGO", ItemName: "TRIGO EM GRAOS", UnitOfMeasure: "KG",
	Quantity: 1000, UnitPrice: 1.5, Total: 1500, UsageCode: 4, UsageName: "COMPRA DE MERCADORIA",
	PurchaseContractKey: "contrato-1", PurchaseContractCode: "CC000002",
};

QUnit.test("a linha nasce do item escolhido: herda produto, unidade, natureza e o contrato do original, sem quantidade nem preço", function (assert) {
	assert.deepEqual(complementLineFrom(candidate, "ValueComplement"), {
		...blankItemRow(),
		ItemCode: "TRIGO", ItemName: "TRIGO EM GRAOS", UnitOfMeasureCode: "KG", PurchaseContractKey: "contrato-1",
		UsageCode: 4, UsageName: "COMPRA DE MERCADORIA", ComplementedItemKey: "item-1",
	});
	assert.strictEqual(complementLineFrom(candidate, "ValueComplement").Quantity, 0);
	assert.strictEqual(complementLineFrom(candidate, "ValueComplement").UnitPrice, 0);
});

QUnit.test("complemento de ICMS: a linha herda do original e nasce com base, valor e complemento zerados", function (assert) {
	const line = complementLineFrom(candidate, "IcmsComplement");
	assert.deepEqual(line, {
		...blankItemRow(),
		ItemCode: "TRIGO", ItemName: "TRIGO EM GRAOS", UnitOfMeasureCode: "KG", PurchaseContractKey: "contrato-1",
		UsageCode: 4, UsageName: "COMPRA DE MERCADORIA", ComplementedItemKey: "item-1",
		IcmsBase: 0, IcmsValue: 0, ComplementAmount: 0,
	});
});

QUnit.test("original sem contrato (D5): a linha nasce sem contrato, para o operador escolher", function (assert) {
	const line = complementLineFrom({ ...candidate, PurchaseContractKey: null, PurchaseContractCode: null }, "ValueComplement");
	assert.strictEqual(line.PurchaseContractKey, null);
	assert.strictEqual(line.ComplementedItemKey, "item-1");
	assert.strictEqual(line.ItemCode, "TRIGO");
});

QUnit.test("contrato herdado trava; original sem contrato deixa editável", function (assert) {
	const withoutContract: PurchaseInvoiceComplementCandidate = { ...candidate, ItemKey: "item-2", PurchaseContractKey: null, PurchaseContractCode: null };
	const inherited = inheritedContracts([candidate, withoutContract]);
	assert.deepEqual(inherited, { "item-1": "contrato-1" });
	assert.strictEqual(isLineContractEditable(true, false, "item-1", inherited), false, "herdado");
	assert.strictEqual(isLineContractEditable(true, false, "item-2", inherited), true, "original sem contrato");
	assert.strictEqual(isLineContractEditable(true, false, null, inherited), true, "linha comum");
	assert.strictEqual(isLineContractEditable(true, false, "item-1", undefined), true, "mapa ainda não carregado: o servidor protege (C10)");
	assert.strictEqual(isLineContractEditable(false, false, "item-2", inherited), false, "Detail");
	assert.strictEqual(isLineContractEditable(true, true, null, inherited), false, "contra-nota");
});

QUnit.test("Nota original = documento/item; sem nItem, interrogação", function (assert) {
	assert.strictEqual(complementedItemLabel("DE000005", 1), "DE000005/1");
	assert.strictEqual(complementedItemLabel("DE000005", null), "DE000005/?");
	assert.deepEqual(complementedItemLabels([candidate]), { "item-1": "DE000005/1" });
	assert.strictEqual(formatComplementedItem("item-1", { "item-1": "DE000005/1" }), "DE000005/1");
	assert.strictEqual(formatComplementedItem("", { "item-1": "DE000005/1" }), "");
	assert.strictEqual(formatComplementedItem("item-2", undefined), "");
});

QUnit.test("código do contrato: o escolhido na tela vale mais que a navegação; sem chave, vazio", function (assert) {
	assert.strictEqual(formatContractCode(undefined, "contrato-1", { "contrato-1": "CC000002" }), "CC000002", "linha nova");
	assert.strictEqual(formatContractCode("CC000001", "contrato-1", { "contrato-1": "CC000002" }), "CC000002", "trocado na tela");
	assert.strictEqual(formatContractCode("CC000001", "contrato-9", {}), "CC000001", "linha gravada");
	assert.strictEqual(formatContractCode("CC000001", null, {}), "", "produto trocado: contrato desamarrado");
});

QUnit.test("withEntry devolve um mapa NOVO (o JSONModel só notifica quando o objeto muda)", function (assert) {
	const before = { a: "1" };
	const after = withEntry(before, "b", "2");
	assert.notStrictEqual(after, before);
	assert.deepEqual(after, { a: "1", b: "2" });
	assert.deepEqual(withEntry(undefined, "", "x"), {});
});

QUnit.module("PurchaseInvoiceDraftHelpers - outra compra no complemento de valor (spec 2026-10-17 D3/D6)");

const otherUsages = { "7": true };

QUnit.test("Normal e complemento de valor podem ser de outra compra; ICMS, Devolução e devolução por NF-e não", function (assert) {
	assert.strictEqual(isOtherPurchaseEligible("Normal", false), true);
	assert.strictEqual(isOtherPurchaseEligible("ValueComplement", false), true);
	assert.strictEqual(isOtherPurchaseEligible("IcmsComplement", false), false, "ICMS não gera título (D5)");
	assert.strictEqual(isOtherPurchaseEligible("Return", false), false);
	assert.strictEqual(isOtherPurchaseEligible("ValueComplement", true), false, "devolução");
});

QUnit.test("complemento de valor com toda natureza de outra compra é documento de outra compra", function (assert) {
	assert.strictEqual(isOtherPurchaseDocument("ValueComplement", false, [7, null], otherUsages), true);
	assert.strictEqual(isOtherPurchaseDocument("ValueComplement", false, [7, 3], otherUsages), false, "mistura com natureza de contrato");
	assert.strictEqual(isOtherPurchaseDocument("IcmsComplement", false, [7], otherUsages), false, "ICMS");
});

QUnit.test("contrato da linha do complemento de valor trava na natureza de outra compra", function (assert) {
	const eligible = isOtherPurchaseEligible("ValueComplement", false);
	assert.strictEqual(isLineContractEditable(true, false, null, {}, 7, otherUsages, eligible), false, "outra compra");
	assert.strictEqual(isLineContractEditable(true, false, null, {}, 3, otherUsages, eligible), true, "natureza de contrato");
});
