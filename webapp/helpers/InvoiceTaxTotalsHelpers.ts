/**
 * Quadro "Tributos" do Detail dos documentos de entrada e de saída: a soma da fotografia fiscal das linhas.
 *
 * Puro para poder ser testado sem view. As duas entidades de linha (`SalesInvoiceItem` e `PurchaseInvoiceItem`)
 * gravam os mesmos campos, então um quadro serve às duas telas.
 */

/** Valor de linha como chega do modelo: Edm.Decimal vem em string (IEEE754Compatible). */
type Amount = number | string;

/** Campos da fotografia fiscal da linha que o quadro lê. */
export type TaxLine = {
	CstIcms: string;
	CstPis: string;
	IbsCbsCst: string;
	IcmsBase: Amount;
	IcmsValue: Amount;
	IcmsDeferredValue: Amount;
	PisBase: Amount;
	PisValue: Amount;
	CofinsBase: Amount;
	CofinsValue: Amount;
	IbsCbsBase: Amount;
	IbsStateValue: Amount;
	IbsMunicipalValue: Amount;
	CbsValue: Amount;
};

/** Linha do quadro. `Base` nula quando o tributo não tem base própria (ICMS diferido). */
export type TaxTotalRow = {
	Tax: string;
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks desligado; null é intencional
	Base: number | null;
	Value: number;
};

/**
 * Campos das linhas que o quadro precisa no `$select`. Com `autoExpandSelect` o UI5 só busca o que a grade mostra,
 * e a grade de itens não mostra tributo: sem isto a soma leria `undefined` e o quadro nunca apareceria.
 */
export const TAX_TOTALS_SELECT =
	"CstIcms,CstPis,IbsCbsCst,IcmsBase,IcmsValue,IcmsDeferredValue,PisBase,PisValue,CofinsBase,CofinsValue," +
	"IbsCbsBase,IbsStateValue,IbsMunicipalValue,CbsValue";

/** Ordem fixa do quadro; `base` ausente = tributo sem base própria. */
const TAXES: { tax: string; base?: keyof TaxLine; value: keyof TaxLine }[] = [
	{ tax: "ICMS", base: "IcmsBase", value: "IcmsValue" },
	{ tax: "ICMS diferido", value: "IcmsDeferredValue" },
	{ tax: "PIS", base: "PisBase", value: "PisValue" },
	{ tax: "COFINS", base: "CofinsBase", value: "CofinsValue" },
	{ tax: "IBS estadual", base: "IbsCbsBase", value: "IbsStateValue" },
	{ tax: "IBS municipal", base: "IbsCbsBase", value: "IbsMunicipalValue" },
	{ tax: "CBS", base: "IbsCbsBase", value: "CbsValue" },
];

/** Número da linha, com 0 quando falta, vem em branco ou não é número. */
function amount(value: unknown): number {
	if (typeof value !== "number" && typeof value !== "string") {
		return 0;
	}
	if (typeof value === "string" && value.trim() === "") {
		return 0;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

/** Soma em centavos: os valores da linha já são de 2 casas, o arredondamento só tira o ruído do ponto flutuante. */
function sum(lines: TaxLine[], field: keyof TaxLine): number {
	return Math.round(lines.reduce((total, line) => total + amount(line[field]), 0) * 100) / 100;
}

/** Linha com tributação gravada: sem CST nenhum (SAPB1, entrada digitada) a linha não foi tributada pelo Siagro. */
function isTaxed(line: TaxLine): boolean {
	return [line.CstIcms, line.CstPis, line.IbsCbsCst].some((cst) => typeof cst === "string" && cst.trim() !== "");
}

/**
 * Quadro de tributos do documento: base e valor de cada tributo somados em todas as linhas, na ordem fixa,
 * sem os tributos de base e valor zerados. Só aparece (`visible`) se alguma linha tem tributação gravada.
 *
 * Linha sem dados é ignorada: na inclusão o total é recalculado quando o `getObject()` da linha transiente
 * ainda volta undefined.
 */
export function summarizeInvoiceTaxes(allLines: TaxLine[]): { visible: boolean; rows: TaxTotalRow[] } {
	const lines = allLines.filter((line) => !!line);

	if (!lines.some(isTaxed)) {
		return { visible: false, rows: [] };
	}

	const rows = TAXES
		.map(({ tax, base, value }) => ({ Tax: tax, Base: base ? sum(lines, base) : null, Value: sum(lines, value) }))
		.filter((row) => (row.Base ?? 0) !== 0 || row.Value !== 0);

	return { visible: true, rows };
}

/** Valor do quadro em pt-BR, 2 casas; base nula (ICMS diferido) fica em branco. */
export function formatTaxAmount(value: number): string {
	if (value === null || value === undefined) {
		return "";
	}

	return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
