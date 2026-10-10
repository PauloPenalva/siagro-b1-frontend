import {
	ChargeLine, chargeLineOf, formatAmount, formatLineGrandTotal, LINE_CHARGES_SELECT, lineFunrural, lineGrandTotal, summarizeInvoiceCharges,
} from "siagrob1/helpers/InvoiceChargeTotalsHelpers";
import { PURCHASE_ITEM_SELECT } from "siagrob1/helpers/PurchaseInvoiceNfeHelpers";

QUnit.module("InvoiceChargeTotalsHelpers - frete, seguro, desconto e outras despesas");

/** Linha zerada; cada teste liga só o que importa. */
function line(values: Partial<ChargeLine>): ChargeLine {
	return { Quantity: 0, UnitPrice: 0, FreightValue: 0, InsuranceValue: 0, DiscountValue: 0, OtherExpensesValue: 0, ...values };
}

QUnit.test("linha sem os quatro valores: total geral = quantidade x preço", function (assert) {
	assert.strictEqual(lineGrandTotal(1000, 1.5, 0, 0, 0, 0), 1500);
	assert.strictEqual(lineGrandTotal(1000, 1.5, null, undefined, "", null), 1500);
});

QUnit.test("total geral da linha soma frete, seguro e outras despesas e tira o desconto", function (assert) {
	assert.strictEqual(lineGrandTotal(1000, 1.5, 100, 20, 50, 30), 1600);
});

QUnit.test("desconto do valor inteiro da linha deixa o total geral em zero", function (assert) {
	assert.strictEqual(lineGrandTotal(10, 2, 5, 1, 26.5, 0.5), 0);
});

QUnit.test("Edm.Decimal chega em string (IEEE754Compatible): converte antes de somar", function (assert) {
	assert.strictEqual(lineGrandTotal("1000.000", "1.50000000", "100.00", "20.00", "50.00", "30.00"), 1600);
});

QUnit.test("seção Totais soma as linhas na ordem da spec, com o total geral destacado", function (assert) {
	const result = summarizeInvoiceCharges([
		line({ Quantity: 1000, UnitPrice: 1.5, FreightValue: 100, InsuranceValue: 20, DiscountValue: 50, OtherExpensesValue: 30 }),
		line({ Quantity: "10.000", UnitPrice: "2.00", FreightValue: "5.00", DiscountValue: "1.00" }),
	]);

	assert.deepEqual(result.rows, [
		{ Label: "Total dos itens", Value: 1520, Emphasized: false },
		{ Label: "Frete", Value: 105, Emphasized: false },
		{ Label: "Seguro", Value: 20, Emphasized: false },
		{ Label: "Outras despesas", Value: 30, Emphasized: false },
		{ Label: "(−) Desconto", Value: 51, Emphasized: false },
		{ Label: "Total geral", Value: 1624, Emphasized: true },
	]);
	assert.strictEqual(result.grandTotal, 1624);
});

QUnit.test("documento sem linhas: tudo zero", function (assert) {
	const result = summarizeInvoiceCharges([]);

	assert.deepEqual([result.items, result.freight, result.discount, result.grandTotal], [0, 0, 0, 0]);
});

QUnit.test("linha ainda sem dados (rascunho recém-criado) é ignorada, sem estourar", function (assert) {
	const result = summarizeInvoiceCharges([undefined, line({ Quantity: 1, UnitPrice: 10, FreightValue: 2 }), null] as ChargeLine[]);

	assert.strictEqual(result.grandTotal, 12);
});

QUnit.test("arredonda a soma em centavos, sem o ruído do ponto flutuante", function (assert) {
	const result = summarizeInvoiceCharges([line({ FreightValue: 0.1 }), line({ FreightValue: 0.2 })]);

	assert.strictEqual(result.freight, 0.3);
	assert.strictEqual(result.grandTotal, 0.3);
});

QUnit.test("formatter da coluna Total devolve o total geral em pt-BR", function (assert) {
	assert.strictEqual(formatLineGrandTotal("30000", "2", "1000", "100", "500", "400"), "61.000,00");
	assert.strictEqual(formatAmount(0), "0,00");
	assert.strictEqual(formatAmount(1234.5), "1.234,50");
});

QUnit.test("chargeLineOf lê os seis campos pelo getProperty do contexto", function (assert) {
	const values: Record<string, unknown> = {
		Quantity: 2, UnitPrice: "3.00", FreightValue: 1, InsuranceValue: 0, DiscountValue: "0.50", OtherExpensesValue: null,
	};

	assert.deepEqual(chargeLineOf({ getProperty: (path: string) => values[path] }), {
		Quantity: 2, UnitPrice: "3.00", FreightValue: 1, InsuranceValue: 0, DiscountValue: "0.50", OtherExpensesValue: null,
	});
});

QUnit.test("o $select das linhas da entrada traz os campos da seção Totais", function (assert) {
	const purchase = PURCHASE_ITEM_SELECT.split(",");

	assert.deepEqual(LINE_CHARGES_SELECT.split(",").filter((field) => !purchase.includes(field)), []);
});

QUnit.test("com Funrural, a seção mostra o retido e o líquido a pagar depois do total geral", function (assert) {
	const result = summarizeInvoiceCharges(
		[{ Quantity: 1000, UnitPrice: 1.5, FreightValue: 0, InsuranceValue: 0, DiscountValue: 0, OtherExpensesValue: 0 }],
		24.45,
	);

	assert.deepEqual(result.rows.slice(-3), [
		{ Label: "Total geral", Value: 1500, Emphasized: true },
		{ Label: "(−) Funrural retido", Value: 24.45, Emphasized: false },
		{ Label: "Líquido a pagar", Value: 1475.55, Emphasized: true },
	]);
	assert.strictEqual(result.netPayable, 1475.55);
});

QUnit.test("na devolução de compra, os rótulos falam em estorno e líquido a receber", function (assert) {
	const result = summarizeInvoiceCharges(
		[{ Quantity: 1000, UnitPrice: 1.5, FreightValue: 0, InsuranceValue: 0, DiscountValue: 0, OtherExpensesValue: 0 }],
		24.45,
		true,
	);

	assert.deepEqual(result.rows.slice(-2), [
		{ Label: "(−) Funrural estornado", Value: 24.45, Emphasized: false },
		{ Label: "Líquido a receber", Value: 1475.55, Emphasized: true },
	]);
});

QUnit.test("sem Funrural, a seção termina no total geral", function (assert) {
	const result = summarizeInvoiceCharges(
		[{ Quantity: 1, UnitPrice: 10, FreightValue: 0, InsuranceValue: 0, DiscountValue: 0, OtherExpensesValue: 0 }]);

	assert.strictEqual(result.rows[result.rows.length - 1].Label, "Total geral");
	assert.strictEqual(result.netPayable, 10);
});

QUnit.test("lineFunrural soma INSS, RAT e SENAR da linha, aceitando string e vazio", function (assert) {
	const values: Record<string, unknown> = { FunruralInssValue: "19.80", FunruralRatValue: 1.65, FunruralSenarValue: undefined };

	assert.strictEqual(lineFunrural({ getProperty: (path: string) => values[path] }), 21.45);
});
