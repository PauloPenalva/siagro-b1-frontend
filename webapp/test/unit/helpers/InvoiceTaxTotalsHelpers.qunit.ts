import {
	formatTaxAmount, summarizeInvoiceTaxes, TAX_TOTALS_SELECT, TaxLine,
} from "siagrob1/helpers/InvoiceTaxTotalsHelpers";
import { PURCHASE_ITEM_SELECT } from "siagrob1/helpers/PurchaseInvoiceNfeHelpers";

QUnit.module("InvoiceTaxTotalsHelpers - quadro de tributos do documento");

/** Linha tributada com tudo zerado; cada teste liga só o que importa. */
function line(values: Partial<TaxLine>): TaxLine {
	return {
		CstIcms: "00", CstPis: "01", IbsCbsCst: "000",
		IcmsBase: 0, IcmsValue: 0, IcmsDeferredValue: 0, PisBase: 0, PisValue: 0, CofinsBase: 0, CofinsValue: 0,
		IbsCbsBase: 0, IbsStateValue: 0, IbsMunicipalValue: 0, CbsValue: 0,
		...values,
	};
}

QUnit.test("documento sem linhas não mostra o quadro", function (assert) {
	assert.deepEqual(summarizeInvoiceTaxes([]), { visible: false, rows: [] });
});

QUnit.test("linhas sem CST (SAPB1, entrada digitada) não mostram o quadro", function (assert) {
	const result = summarizeInvoiceTaxes([line({ CstIcms: null, CstPis: null, IbsCbsCst: null, IcmsBase: 100 })]);

	assert.strictEqual(result.visible, false);
});

QUnit.test("um CST em qualquer linha basta para mostrar o quadro", function (assert) {
	const result = summarizeInvoiceTaxes([
		line({ CstIcms: null, CstPis: null, IbsCbsCst: null }),
		line({ CstIcms: null, CstPis: null, IbsCbsCst: "200", IbsCbsBase: 10, CbsValue: 0.09 }),
	]);

	assert.strictEqual(result.visible, true);
});

QUnit.test("soma base e valor de cada tributo em todas as linhas, na ordem fixa do quadro", function (assert) {
	const result = summarizeInvoiceTaxes([
		line({
			IcmsBase: 1000, IcmsValue: 180, PisBase: 1000, PisValue: 16.5, CofinsBase: 1000, CofinsValue: 76,
			IbsCbsBase: 1000, IbsStateValue: 1, IbsMunicipalValue: 0.5, CbsValue: 9,
		}),
		line({
			IcmsBase: 500, IcmsValue: 90, PisBase: 500, PisValue: 8.25, CofinsBase: 500, CofinsValue: 38,
			IbsCbsBase: 500, IbsStateValue: 0.5, IbsMunicipalValue: 0.25, CbsValue: 4.5,
		}),
	]);

	assert.deepEqual(result.rows, [
		{ Tax: "ICMS", Base: 1500, Value: 270 },
		{ Tax: "PIS", Base: 1500, Value: 24.75 },
		{ Tax: "COFINS", Base: 1500, Value: 114 },
		{ Tax: "IBS estadual", Base: 1500, Value: 1.5 },
		{ Tax: "IBS municipal", Base: 1500, Value: 0.75 },
		{ Tax: "CBS", Base: 1500, Value: 13.5 },
	]);
});

QUnit.test("ICMS diferido vem logo depois do ICMS, sem base", function (assert) {
	// Devolução de terceiro do E2E (CST 51, diferimento total): ICMS zerado com base, o valor todo diferido.
	const result = summarizeInvoiceTaxes([
		line({ CstIcms: "51", IcmsBase: 700, IcmsValue: 0, IcmsDeferredValue: 126 }),
	]);

	assert.deepEqual(result.rows, [
		{ Tax: "ICMS", Base: 700, Value: 0 },
		{ Tax: "ICMS diferido", Base: null, Value: 126 },
	]);
});

QUnit.test("tributo com base e valor zerados some do quadro", function (assert) {
	const result = summarizeInvoiceTaxes([line({ IbsCbsBase: 700, IbsStateValue: 0.28, CbsValue: 2.52 })]);

	assert.deepEqual(result.rows.map((row) => row.Tax), ["IBS estadual", "IBS municipal", "CBS"]);
});

QUnit.test("Edm.Decimal chega em string (IEEE754Compatible): converte antes de somar", function (assert) {
	const result = summarizeInvoiceTaxes([
		line({ IcmsBase: "700.00", IcmsValue: "126.00" }),
		line({ IcmsBase: "300.00", IcmsValue: "54.00" }),
	]);

	assert.deepEqual(result.rows, [{ Tax: "ICMS", Base: 1000, Value: 180 }]);
});

QUnit.test("arredonda a soma em centavos, sem o ruído do ponto flutuante", function (assert) {
	const result = summarizeInvoiceTaxes([line({ PisBase: 0.1, PisValue: 0.1 }), line({ PisBase: 0.2, PisValue: 0.2 })]);

	assert.deepEqual(result.rows, [{ Tax: "PIS", Base: 0.3, Value: 0.3 }]);
});

QUnit.test("valor nulo, vazio ou não numérico conta como zero", function (assert) {
	const result = summarizeInvoiceTaxes([
		line({ CbsValue: null, IbsCbsBase: "", IbsStateValue: "abc", IcmsBase: 10, IcmsValue: 1 }),
	]);

	assert.deepEqual(result.rows, [{ Tax: "ICMS", Base: 10, Value: 1 }]);
});

QUnit.test("valor do quadro em pt-BR com 2 casas; base nula fica em branco", function (assert) {
	assert.strictEqual(formatTaxAmount(1234.5), "1.234,50");
	assert.strictEqual(formatTaxAmount(0), "0,00");
	assert.strictEqual(formatTaxAmount(null), "");
	assert.strictEqual(formatTaxAmount(undefined), "");
});

QUnit.test("$select do quadro traz todos os campos que a soma lê", function (assert) {
	const selected = TAX_TOTALS_SELECT.split(",");
	const read: (keyof TaxLine)[] = [
		"CstIcms", "CstPis", "IbsCbsCst", "IcmsBase", "IcmsValue", "IcmsDeferredValue", "PisBase", "PisValue",
		"CofinsBase", "CofinsValue", "IbsCbsBase", "IbsStateValue", "IbsMunicipalValue", "CbsValue",
	];

	assert.deepEqual(read.filter((field) => !selected.includes(field)), []);
});

QUnit.test("o $select das linhas da entrada já cobre o quadro", function (assert) {
	const purchase = PURCHASE_ITEM_SELECT.split(",");

	assert.deepEqual(TAX_TOTALS_SELECT.split(",").filter((field) => !purchase.includes(field)), []);
});

QUnit.test("linha ainda sem dados (rascunho recém-criado) é ignorada, sem estourar", function (assert) {
	// Na inclusão, `getObject()` da linha transiente ainda volta undefined quando o total é recalculado.
	const lines = [undefined, line({ IcmsBase: 10, IcmsValue: 1 }), null] as TaxLine[];

	assert.deepEqual(summarizeInvoiceTaxes(lines), { visible: true, rows: [{ Tax: "ICMS", Base: 10, Value: 1 }] });
	assert.deepEqual(summarizeInvoiceTaxes([undefined] as TaxLine[]), { visible: false, rows: [] });
});
