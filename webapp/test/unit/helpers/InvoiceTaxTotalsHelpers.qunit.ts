import {
	buildTaxTotals, DIFAL_SELECT, formatTaxAmount, summarizeInvoiceTaxes, TAX_TOTALS_SELECT, TaxEffectContext, TaxLine,
} from "siagrob1/helpers/InvoiceTaxTotalsHelpers";
import { PURCHASE_ITEM_SELECT } from "siagrob1/helpers/PurchaseInvoiceNfeHelpers";

QUnit.module("InvoiceTaxTotalsHelpers - quadro de tributos do documento");

/** Entrada de revenda numa filial do Lucro Real; cada teste troca só o que importa. */
function ctxOf(values: Partial<TaxEffectContext> = {}): TaxEffectContext {
	return {
		direction: "Incoming", isReturn: false, branchSimples: false, pisCofinsRegime: "NonCumulative",
		purposeOf: () => "ResaleOrInput", ...values,
	};
}

const CTX = ctxOf();

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
	assert.deepEqual(summarizeInvoiceTaxes([], CTX), { visible: false, rows: [] });
});

QUnit.test("linhas sem CST (SAPB1, entrada digitada) não mostram o quadro", function (assert) {
	const result = summarizeInvoiceTaxes([line({ CstIcms: null, CstPis: null, IbsCbsCst: null, IcmsBase: 100 })], CTX);

	assert.strictEqual(result.visible, false);
});

QUnit.test("um CST em qualquer linha basta para mostrar o quadro", function (assert) {
	const result = summarizeInvoiceTaxes([
		line({ CstIcms: null, CstPis: null, IbsCbsCst: null }),
		line({ CstIcms: null, CstPis: null, IbsCbsCst: "200", IbsCbsBase: 10, CbsValue: 0.09 }),
	], CTX);

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
	], CTX);

	assert.deepEqual(result.rows, [
		{ Tax: "ICMS", Base: 1500, Value: 270, Effect: "Crédito na apuração" },
		{ Tax: "PIS", Base: 1500, Value: 24.75, Effect: "Sem crédito" },
		{ Tax: "COFINS", Base: 1500, Value: 114, Effect: "Sem crédito" },
		{ Tax: "IBS estadual", Base: 1500, Value: 1.5, Effect: "Crédito na apuração" },
		{ Tax: "IBS municipal", Base: 1500, Value: 0.75, Effect: "Crédito na apuração" },
		{ Tax: "CBS", Base: 1500, Value: 13.5, Effect: "Crédito na apuração" },
	]);
});

QUnit.test("ICMS diferido vem logo depois do ICMS, sem base", function (assert) {
	// Devolução de terceiro do E2E (CST 51, diferimento total): ICMS zerado com base, o valor todo diferido.
	const result = summarizeInvoiceTaxes([
		line({ CstIcms: "51", IcmsBase: 700, IcmsValue: 0, IcmsDeferredValue: 126 }),
	], CTX);

	assert.deepEqual(result.rows, [
		{ Tax: "ICMS", Base: 700, Value: 0, Effect: "Sem crédito" },
		{ Tax: "ICMS diferido", Base: null, Value: 126, Effect: "Diferido" },
	]);
});

QUnit.test("tributo com base e valor zerados some do quadro", function (assert) {
	const result = summarizeInvoiceTaxes([line({ IbsCbsBase: 700, IbsStateValue: 0.28, CbsValue: 2.52 })], CTX);

	assert.deepEqual(result.rows.map((row) => row.Tax), ["IBS estadual", "IBS municipal", "CBS"]);
});

QUnit.test("Edm.Decimal chega em string (IEEE754Compatible): converte antes de somar", function (assert) {
	const result = summarizeInvoiceTaxes([
		line({ IcmsBase: "700.00", IcmsValue: "126.00" }),
		line({ IcmsBase: "300.00", IcmsValue: "54.00" }),
	], CTX);

	assert.deepEqual(result.rows, [{ Tax: "ICMS", Base: 1000, Value: 180, Effect: "Crédito na apuração" }]);
});

QUnit.test("arredonda a soma em centavos, sem o ruído do ponto flutuante", function (assert) {
	const result = summarizeInvoiceTaxes([line({ PisBase: 0.1, PisValue: 0.1 }), line({ PisBase: 0.2, PisValue: 0.2 })], CTX);

	assert.deepEqual(result.rows, [{ Tax: "PIS", Base: 0.3, Value: 0.3, Effect: "Sem crédito" }]);
});

QUnit.test("valor nulo, vazio ou não numérico conta como zero", function (assert) {
	const result = summarizeInvoiceTaxes([
		line({ CbsValue: null, IbsCbsBase: "", IbsStateValue: "abc", IcmsBase: 10, IcmsValue: 1 }),
	], CTX);

	assert.deepEqual(result.rows, [{ Tax: "ICMS", Base: 10, Value: 1, Effect: "Crédito na apuração" }]);
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
		"CstIcms", "CstPis", "CstCofins", "IbsCbsCst", "IcmsBase", "IcmsValue", "IcmsDeferredValue", "PisBase", "PisValue",
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

	assert.deepEqual(summarizeInvoiceTaxes(lines, CTX), { visible: true, rows: [{ Tax: "ICMS", Base: 10, Value: 1, Effect: "Crédito na apuração" }] });
	assert.deepEqual(summarizeInvoiceTaxes([undefined] as TaxLine[], CTX), { visible: false, rows: [] });
});

QUnit.test("entrada com Funrural mostra INSS, RAT e SENAR depois dos tributos da NF-e", function (assert) {
	const result = summarizeInvoiceTaxes([
		line({ IcmsBase: 1500, FunruralBase: 1500, FunruralInssValue: 19.8, FunruralRatValue: 1.65, FunruralSenarValue: 3 }),
		line({ FunruralBase: "750.00", FunruralSenarValue: "1.50" }),
	], CTX);

	assert.deepEqual(result.rows.slice(-3), [
		{ Tax: "Funrural - INSS", Base: 2250, Value: 19.8, Effect: "Retido na fonte" },
		{ Tax: "Funrural - RAT", Base: 2250, Value: 1.65, Effect: "Retido na fonte" },
		{ Tax: "Funrural - SENAR", Base: 2250, Value: 4.5, Effect: "Retido na fonte" },
	]);
});

QUnit.test("linha sem Funrural (saída de venda) não mostra as linhas do Funrural", function (assert) {
	const result = summarizeInvoiceTaxes([line({ IcmsBase: 1000, IcmsValue: 180 })], CTX);

	assert.notOk(result.rows.some((row) => row.Tax.startsWith("Funrural")));
});

QUnit.test("TAX_TOTALS_SELECT não pede Funrural (a linha de saída não tem os campos)", function (assert) {
	assert.notOk(TAX_TOTALS_SELECT.includes("Funrural"));
});

QUnit.test("a grade de entrada pede os campos do Funrural", function (assert) {
	for (const field of ["FunruralBase", "FunruralInssRate", "FunruralInssValue", "FunruralRatRate", "FunruralRatValue",
		"FunruralSenarRate", "FunruralSenarValue"]) {
		assert.ok(PURCHASE_ITEM_SELECT.split(",").includes(field), field);
	}
});

QUnit.test("decisão judicial: só a linha do SENAR aparece", function (assert) {
	const result = summarizeInvoiceTaxes([line({ FunruralBase: 1500, FunruralSenarValue: 3 })], CTX);

	assert.deepEqual(result.rows.filter((row) => row.Tax.startsWith("Funrural")).map((row) => row.Tax), ["Funrural - SENAR"]);
});

// ---- Coluna "Efeito" (spec 2026-10-17 §3) ----

/** Linha de entrada com o ICMS de 18 % sobre 1.000; cada teste liga só o que importa. */
function icmsLine(values: Partial<TaxLine> = {}): TaxLine {
	return line({ IcmsBase: 1000, IcmsValue: 180, ...values });
}

function effectOfRow(rows: { Tax: string; Effect: string }[], tax: string): string[] {
	return rows.filter((row) => row.Tax === tax).map((row) => row.Effect);
}

QUnit.test("ICMS resale credit", function (assert) {
	assert.deepEqual(effectOfRow(buildTaxTotals([icmsLine()], ctxOf()), "ICMS"), ["Crédito na apuração"]);
});

QUnit.test("ICMS use-and-consumption no credit", function (assert) {
	const rows = buildTaxTotals([icmsLine()], ctxOf({ purposeOf: () => "UseAndConsumption" }));

	assert.deepEqual(effectOfRow(rows, "ICMS"), ["Sem crédito"]);
});

QUnit.test("ICMS fixed asset CIAP", function (assert) {
	const rows = buildTaxTotals([icmsLine()], ctxOf({ purposeOf: () => "FixedAsset" }));

	assert.deepEqual(effectOfRow(rows, "ICMS"), ["Crédito CIAP (1/48)"]);
});

QUnit.test("ICMS lines with different purposes become separate rows", function (assert) {
	const lines = [icmsLine({ UsageCode: 1 }), icmsLine({ UsageCode: 2 }), icmsLine({ UsageCode: 1 })];
	const rows = buildTaxTotals(lines, ctxOf({ purposeOf: (l) => (l.UsageCode === 2 ? "UseAndConsumption" : "ResaleOrInput") }));

	assert.deepEqual(rows.filter((row) => row.Tax === "ICMS"), [
		{ Tax: "ICMS", Base: 2000, Value: 360, Effect: "Crédito na apuração" },
		{ Tax: "ICMS", Base: 1000, Value: 180, Effect: "Sem crédito" },
	]);
});

QUnit.test("Simples branch ICMS no credit and DIFAL \"A recolher em guia\"", function (assert) {
	const rows = buildTaxTotals([icmsLine({ DifalBase: 1000, DifalValue: 60, FcpValue: 10 })],
		ctxOf({ branchSimples: true, purposeOf: () => "UseAndConsumption" }));

	assert.deepEqual(effectOfRow(rows, "ICMS"), ["Sem crédito"]);
	assert.deepEqual(effectOfRow(rows, "DIFAL"), ["A recolher em guia"]);
	assert.deepEqual(effectOfRow(rows, "FCP do DIFAL"), ["A recolher em guia"]);
});

QUnit.test("Simples branch resale ICMS has no credit either", function (assert) {
	assert.deepEqual(effectOfRow(buildTaxTotals([icmsLine()], ctxOf({ branchSimples: true })), "ICMS"), ["Sem crédito"]);
});

QUnit.test("PIS CST 50 non-cumulative credit", function (assert) {
	const rows = buildTaxTotals([line({ CstPis: "50", CstCofins: "50", PisBase: 1000, PisValue: 16.5, CofinsBase: 1000, CofinsValue: 76 })], ctxOf());

	assert.deepEqual(effectOfRow(rows, "PIS"), ["Crédito na apuração"]);
	assert.deepEqual(effectOfRow(rows, "COFINS"), ["Crédito na apuração"]);
});

QUnit.test("PIS and COFINS with different CSTs", function (assert) {
	const rows = buildTaxTotals([line({ CstPis: "50", CstCofins: "70", PisBase: 1000, PisValue: 16.5, CofinsBase: 1000, CofinsValue: 76 })],
		ctxOf());

	assert.deepEqual(effectOfRow(rows, "PIS"), ["Crédito na apuração"]);
	assert.deepEqual(effectOfRow(rows, "COFINS"), ["Sem crédito"]);
});

QUnit.test("CRT 2 branch ICMS credit and DIFAL debit", function (assert) {
	// SimplesNacionalExcess não é "Simples" para o ICMS (FiscalCodes.cs): a tela manda branchSimples falso.
	const rows = buildTaxTotals([icmsLine({ DifalBase: 1000, DifalValue: 60 })], ctxOf({ branchSimples: false }));

	assert.deepEqual(effectOfRow(rows, "ICMS"), ["Crédito na apuração"]);
	assert.deepEqual(effectOfRow(rows, "DIFAL"), ["Débito na apuração"]);
});

QUnit.test("Incoming purchase return debit", function (assert) {
	const rows = buildTaxTotals([line({ IcmsBase: 1000, IcmsValue: 180, IcmsDeferredValue: 5, PisBase: 1000, PisValue: 16.5,
		CofinsBase: 1000, CofinsValue: 76, IbsCbsBase: 1000, CbsValue: 9, DifalBase: 1000, DifalValue: 60 })],
		ctxOf({ isReturn: true, withholdings: { base: 100, iss: 5, irrf: 0, inss: 0, pis: 0, cofins: 0, csll: 0 } }));

	for (const tax of ["ICMS", "PIS", "COFINS", "CBS"]) {
		assert.deepEqual(effectOfRow(rows, tax), ["Débito na apuração"], tax);
	}
	assert.deepEqual(effectOfRow(rows, "ICMS diferido"), ["Diferido"]);
	assert.deepEqual(effectOfRow(rows, "DIFAL"), ["Débito na apuração"]);
	assert.deepEqual(effectOfRow(rows, "ISS retido"), ["Retido na fonte"]);
});

QUnit.test("PIS CST 50 cumulative no credit", function (assert) {
	const rows = buildTaxTotals([line({ CstPis: "50", PisBase: 1000, PisValue: 6.5 })], ctxOf({ pisCofinsRegime: "Cumulative" }));

	assert.deepEqual(effectOfRow(rows, "PIS"), ["Sem crédito"]);
});

QUnit.test("PIS CST 70 no credit", function (assert) {
	const rows = buildTaxTotals([line({ CstPis: "70", PisBase: 1000, PisValue: 16.5 })], ctxOf());

	assert.deepEqual(effectOfRow(rows, "PIS"), ["Sem crédito"]);
});

QUnit.test("Deferred ICMS", function (assert) {
	const rows = buildTaxTotals([line({ CstIcms: "51", IcmsBase: 700, IcmsDeferredValue: 126 })], ctxOf());

	assert.deepEqual(effectOfRow(rows, "ICMS diferido"), ["Diferido"]);
});

QUnit.test("DIFAL and FCP debit", function (assert) {
	const rows = buildTaxTotals([icmsLine({ DifalBase: 1219.51, DifalValue: 36.59, FcpValue: 0 }),
		icmsLine({ DifalBase: "1000.00", DifalValue: "30.00", FcpValue: "20.00" })], ctxOf({ purposeOf: () => "UseAndConsumption" }));

	assert.deepEqual(rows.filter((row) => row.Tax === "DIFAL" || row.Tax === "FCP do DIFAL"), [
		{ Tax: "DIFAL", Base: 2219.51, Value: 66.59, Effect: "Débito na apuração" },
		{ Tax: "FCP do DIFAL", Base: 2219.51, Value: 20, Effect: "Débito na apuração" },
	]);
});

QUnit.test("Withholding rows \"Retido na fonte\" with WithholdingBase", function (assert) {
	const rows = buildTaxTotals([], ctxOf({
		withholdings: { base: 5000, iss: 100, irrf: 75, inss: 0, pis: 32.5, cofins: 150, csll: 50 },
	}));

	assert.deepEqual(rows, [
		{ Tax: "ISS retido", Base: 5000, Value: 100, Effect: "Retido na fonte" },
		{ Tax: "IRRF retido", Base: 5000, Value: 75, Effect: "Retido na fonte" },
		{ Tax: "PIS retido", Base: 5000, Value: 32.5, Effect: "Retido na fonte" },
		{ Tax: "COFINS retido", Base: 5000, Value: 150, Effect: "Retido na fonte" },
		{ Tax: "CSLL retido", Base: 5000, Value: 50, Effect: "Retido na fonte" },
	]);
});

QUnit.test("Outgoing sale debit", function (assert) {
	const rows = buildTaxTotals([line({ IcmsBase: 1000, IcmsValue: 180, PisBase: 1000, PisValue: 16.5, CbsValue: 9, IbsCbsBase: 1000 })],
		ctxOf({ direction: "Outgoing" }));

	assert.deepEqual([...new Set(rows.map((row) => row.Effect))], ["Débito na apuração"]);
});

QUnit.test("Outgoing return credit", function (assert) {
	const rows = buildTaxTotals([line({ IcmsBase: 1000, IcmsValue: 180, IcmsDeferredValue: 5 })],
		ctxOf({ direction: "Outgoing", isReturn: true }));

	assert.deepEqual(effectOfRow(rows, "ICMS"), ["Crédito na apuração"]);
	assert.deepEqual(effectOfRow(rows, "ICMS diferido"), ["Diferido"]);
});

QUnit.test("IBS/CBS credit, except exempt CST", function (assert) {
	const credit = buildTaxTotals([line({ IbsCbsBase: 1000, CbsValue: 9 })], ctxOf());
	const exempt = buildTaxTotals([line({ IbsCbsCst: "400", IbsCbsBase: 1000, CbsValue: 9 })], ctxOf());

	assert.deepEqual(effectOfRow(credit, "CBS"), ["Crédito na apuração"]);
	assert.deepEqual(effectOfRow(exempt, "CBS"), ["Sem crédito"]);
});

QUnit.test("Rows without CST still show withholdings and DIFAL", function (assert) {
	const untaxed = line({ CstIcms: null, CstPis: null, IbsCbsCst: null, DifalBase: 1000, DifalValue: 60 });
	const result = summarizeInvoiceTaxes([untaxed], ctxOf({
		withholdings: { base: 5000, iss: 100, irrf: 0, inss: 0, pis: 0, cofins: 0, csll: 0 },
	}));

	assert.strictEqual(result.visible, true);
	assert.deepEqual(result.rows.map((row) => row.Tax), ["DIFAL", "ISS retido"]);
});

QUnit.test("Zero rows hidden", function (assert) {
	const rows = buildTaxTotals([line({ DifalBase: 1000, DifalValue: 0, FcpValue: 0 })], ctxOf({
		withholdings: { base: 5000, iss: 0, irrf: 0, inss: 0, pis: 0, cofins: 0, csll: 0 },
	}));

	assert.deepEqual(rows, []);
});

QUnit.test("DIFAL_SELECT está na grade de entrada e fora do $select compartilhado com a saída", function (assert) {
	assert.deepEqual(DIFAL_SELECT.split(",").filter((field) => !PURCHASE_ITEM_SELECT.split(",").includes(field)), []);
	assert.notOk(TAX_TOTALS_SELECT.includes("Difal"));
});
