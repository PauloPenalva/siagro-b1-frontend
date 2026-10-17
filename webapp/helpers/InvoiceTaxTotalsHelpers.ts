/**
 * Quadro "Tributos" do Detail dos documentos de entrada e de saída: a soma da fotografia fiscal das linhas.
 *
 * Puro para poder ser testado sem view. As duas entidades de linha (`SalesInvoiceItem` e `PurchaseInvoiceItem`)
 * gravam os mesmos campos, então um quadro serve às duas telas.
 */

/** Valor de linha como chega do modelo: Edm.Decimal vem em string (IEEE754Compatible). */
type Amount = number | string;

/** Destinação da natureza de entrada (`Usage.PurchasePurpose`). */
export type PurchasePurpose = "ResaleOrInput" | "UseAndConsumption" | "FixedAsset";

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
	/** Natureza da linha: a destinação dela decide o efeito do ICMS (só entrada). */
	UsageCode?: number | string;
	/** Só a linha de ENTRADA tem Funrural (spec 2026-10-09 §7); na de saída os campos não existem. */
	FunruralBase?: Amount;
	FunruralInssValue?: Amount;
	FunruralRatValue?: Amount;
	FunruralSenarValue?: Amount;
	/** DIFAL e FCP do DIFAL: só a linha de ENTRADA tem (spec 2026-10-17 §2). */
	DifalBase?: Amount;
	DifalValue?: Amount;
	FcpValue?: Amount;
};

/** Linha do quadro. `Base` nula quando o tributo não tem base própria (ICMS diferido). */
export type TaxTotalRow = {
	Tax: string;
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks desligado; null é intencional
	Base: number | null;
	Value: number;
	/** O que o tributo faz na apuração: "Crédito na apuração", "Sem crédito", "Retido na fonte"... */
	Effect: string;
};

/** Retenções do cabeçalho do documento de entrada (outra compra); a base é `WithholdingBase`. */
export type Withholdings = {
	base: number; iss: number; irrf: number; inss: number; pis: number; cofins: number; csll: number;
};

/** O que o efeito de cada tributo precisa saber além das linhas. */
export type TaxEffectContext = {
	direction: "Incoming" | "Outgoing";
	/** Documento de devolução: na saída o imposto vira crédito. */
	isReturn: boolean;
	/** Filial do Simples Nacional (CRT 1, 2 ou 4): sem crédito de ICMS e DIFAL em guia. */
	branchSimples: boolean;
	pisCofinsRegime: "Cumulative" | "NonCumulative";
	purposeOf: (line: TaxLine) => PurchasePurpose;
	withholdings?: Withholdings;
};

export const EFFECT_CREDIT = "Crédito na apuração";
export const EFFECT_NO_CREDIT = "Sem crédito";
export const EFFECT_CIAP = "Crédito CIAP (1/48)";
export const EFFECT_DEFERRED = "Diferido";
export const EFFECT_DEBIT = "Débito na apuração";
export const EFFECT_PAYABLE_SLIP = "A recolher em guia";
export const EFFECT_WITHHELD = "Retido na fonte";

/**
 * Campos das linhas que o quadro precisa no `$select`. Com `autoExpandSelect` o UI5 só busca o que a grade mostra,
 * e a grade de itens não mostra tributo: sem isto a soma leria `undefined` e o quadro nunca apareceria.
 */
export const TAX_TOTALS_SELECT =
	"CstIcms,CstPis,IbsCbsCst,IcmsBase,IcmsValue,IcmsDeferredValue,PisBase,PisValue,CofinsBase,CofinsValue," +
	"IbsCbsBase,IbsStateValue,IbsMunicipalValue,CbsValue";

/** DIFAL e FCP: só a linha de entrada tem (a de saída não tem os campos, então ficam fora de TAX_TOTALS_SELECT). */
export const DIFAL_SELECT = "DifalBase,DifalInternalRate,DifalInterstateRate,DifalValue,FcpRate,FcpValue";

type TaxKind = "icms" | "deferred" | "pis" | "cofins" | "ibsCbs" | "funrural" | "difal" | "fcp";

/** Ordem fixa do quadro; `base` ausente = tributo sem base própria. */
const TAXES: { tax: string; kind: TaxKind; base?: keyof TaxLine; value: keyof TaxLine }[] = [
	{ tax: "ICMS", kind: "icms", base: "IcmsBase", value: "IcmsValue" },
	{ tax: "ICMS diferido", kind: "deferred", value: "IcmsDeferredValue" },
	{ tax: "PIS", kind: "pis", base: "PisBase", value: "PisValue" },
	{ tax: "COFINS", kind: "cofins", base: "CofinsBase", value: "CofinsValue" },
	{ tax: "IBS estadual", kind: "ibsCbs", base: "IbsCbsBase", value: "IbsStateValue" },
	{ tax: "IBS municipal", kind: "ibsCbs", base: "IbsCbsBase", value: "IbsMunicipalValue" },
	{ tax: "CBS", kind: "ibsCbs", base: "IbsCbsBase", value: "CbsValue" },
	{ tax: "Funrural - INSS", kind: "funrural", base: "FunruralBase", value: "FunruralInssValue" },
	{ tax: "Funrural - RAT", kind: "funrural", base: "FunruralBase", value: "FunruralRatValue" },
	{ tax: "Funrural - SENAR", kind: "funrural", base: "FunruralBase", value: "FunruralSenarValue" },
	{ tax: "DIFAL", kind: "difal", base: "DifalBase", value: "DifalValue" },
	{ tax: "FCP do DIFAL", kind: "fcp", base: "DifalBase", value: "FcpValue" },
];

/** CST de IBS/CBS de isenção e não incidência (LC 214/2025): não geram crédito. */
const IBS_CBS_NO_CREDIT_CSTS = ["400", "410"];

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

/** CST de PIS/COFINS que dá direito a crédito (50 a 66). */
function isPisCofinsCreditCst(cst: string): boolean {
	const value = Number(cst);
	return typeof cst === "string" && cst.trim() !== "" && value >= 50 && value <= 66;
}

/** Efeito de um tributo numa linha, conforme a tabela da spec 2026-10-17 §3 e as decisões 3 e 7. */
function effectOf(kind: TaxKind, line: TaxLine, ctx: TaxEffectContext): string {
	if (kind === "deferred") {
		return EFFECT_DEFERRED;
	}
	if (kind === "funrural") {
		return EFFECT_WITHHELD;
	}
	if (kind === "difal" || kind === "fcp") {
		// Simples não tem apuração mensal de ICMS: o DIFAL vai em guia (decisão 3).
		return ctx.branchSimples ? EFFECT_PAYABLE_SLIP : EFFECT_DEBIT;
	}

	if (ctx.direction === "Outgoing") {
		return ctx.isReturn ? EFFECT_CREDIT : EFFECT_DEBIT;
	}

	switch (kind) {
		case "icms": {
			if (ctx.branchSimples || amount(line.IcmsValue) <= 0) {
				return EFFECT_NO_CREDIT;
			}
			const purpose = ctx.purposeOf(line);
			if (purpose === "UseAndConsumption") {
				return EFFECT_NO_CREDIT;
			}
			return purpose === "FixedAsset" ? EFFECT_CIAP : EFFECT_CREDIT;
		}
		case "pis":
		case "cofins":
			return ctx.pisCofinsRegime === "NonCumulative" && isPisCofinsCreditCst(line.CstPis) ? EFFECT_CREDIT : EFFECT_NO_CREDIT;
		default:
			// IBS/CBS
			return IBS_CBS_NO_CREDIT_CSTS.includes(String(line.IbsCbsCst ?? "").trim()) ? EFFECT_NO_CREDIT : EFFECT_CREDIT;
	}
}

/** Linha do quadro some quando não tem valor (e, nos tributos de base própria, nem base). */
function isHidden(kind: TaxKind, row: TaxTotalRow): boolean {
	if (kind === "funrural" || kind === "difal" || kind === "fcp") {
		return row.Value === 0;
	}
	return (row.Base ?? 0) === 0 && row.Value === 0;
}

/** Retenções do cabeçalho viram linhas "Retido na fonte" depois dos tributos das linhas. */
function withholdingRows(w: Withholdings): TaxTotalRow[] {
	if (!w) {
		return [];
	}

	return ([
		["ISS retido", w.iss], ["IRRF retido", w.irrf], ["INSS retido", w.inss],
		["PIS retido", w.pis], ["COFINS retido", w.cofins], ["CSLL retido", w.csll],
	] as [string, number][])
		.map(([tax, value]) => ({ Tax: tax, Base: amount(w.base), Value: amount(value), Effect: EFFECT_WITHHELD }))
		.filter((row) => row.Value !== 0);
}

/**
 * Linhas do quadro de tributos: base e valor de cada tributo somados nas linhas que dividem o mesmo efeito, na ordem
 * fixa, mais as retenções do cabeçalho. Linhas de ICMS com efeitos diferentes (uso e consumo e revenda no mesmo
 * documento) viram linhas separadas. Tributo zerado some.
 *
 * Linha sem dados é ignorada: na inclusão o total é recalculado quando o `getObject()` da linha transiente
 * ainda volta undefined.
 */
export function buildTaxTotals(allLines: TaxLine[], ctx: TaxEffectContext): TaxTotalRow[] {
	const lines = allLines.filter((line) => !!line);
	const rows: TaxTotalRow[] = [];

	for (const { tax, kind, base, value } of TAXES) {
		const byEffect = new Map<string, TaxLine[]>();
		for (const line of lines) {
			const effect = effectOf(kind, line, ctx);
			byEffect.set(effect, [...(byEffect.get(effect) ?? []), line]);
		}

		for (const [effect, group] of byEffect) {
			const row = { Tax: tax, Base: base ? sum(group, base) : null, Value: sum(group, value), Effect: effect };
			if (!isHidden(kind, row)) {
				rows.push(row);
			}
		}
	}

	return [...rows, ...(ctx.direction === "Incoming" ? withholdingRows(ctx.withholdings) : [])];
}

/**
 * Quadro de tributos do documento. Aparece (`visible`) se alguma linha tem tributação gravada ou se há DIFAL ou
 * retenção para mostrar: documento de outra compra pode não ter CST nenhum e ainda assim reter imposto.
 */
export function summarizeInvoiceTaxes(allLines: TaxLine[], ctx: TaxEffectContext): { visible: boolean; rows: TaxTotalRow[] } {
	const rows = buildTaxTotals(allLines, ctx);

	// Só DIFAL e retenção mostram o quadro sozinhos; uma base de ICMS sem CST (SAPB1, entrada digitada) não.
	const standalone = rows.some((row) => row.Tax === "DIFAL" || row.Tax === "FCP do DIFAL" || row.Effect === EFFECT_WITHHELD
		&& row.Tax.endsWith(" retido"));

	return { visible: allLines.some((line) => !!line && isTaxed(line)) || standalone, rows };
}

/** Valor do quadro em pt-BR, 2 casas; base nula (ICMS diferido) fica em branco. */
export function formatTaxAmount(value: number): string {
	if (value === null || value === undefined) {
		return "";
	}

	return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
