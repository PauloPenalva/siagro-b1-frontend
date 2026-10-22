/**
 * Regras de distribuição: lógica pura das telas (total ao vivo, versão editável, payloads).
 * O REST devolve camelCase; o OData v4 devolve PascalCase - as duas formas são aceitas.
 */

export interface RuleLine {
	CostCenterCode: string;
	AccountingItemCode: string;
	Percentage: number;
}

export interface RuleVersion {
	Id?: string;
	/** `yyyy-MM-dd`. */
	ValidFrom: string;
	Lines: RuleLine[];
	/** Versão ainda não gravada no servidor. */
	IsNew?: boolean;
}

export interface Rule {
	Code: string;
	Name: string;
	Inactive: boolean;
	Versions: RuleVersion[];
}

export type VersionStatus = "Past" | "Current" | "Future";

type Raw = Record<string, unknown>;

function text(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function pick(raw: Raw, pascal: string): unknown {
	const camel = pascal.charAt(0).toLowerCase() + pascal.slice(1);
	return raw[pascal] ?? raw[camel];
}

/** Data de calendário de Brasília (`yyyy-MM-dd`), independente do fuso do navegador. */
export function todayInBrasilia(now: Date = new Date()): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Sao_Paulo",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(now);
}

/** Soma dos percentuais (linhas vazias contam 0), arredondada em 4 casas para evitar ruído de ponto flutuante. */
export function sumPercentages(lines: RuleLine[]): number {
	const total = (lines ?? []).reduce((acc, line) => acc + (Number(line.Percentage) || 0), 0);
	return Math.round(total * 10000) / 10000;
}

export function isTotalValid(lines: RuleLine[]): boolean {
	return sumPercentages(lines) === 100;
}

/** Só versões que começam depois de hoje podem ser alteradas ou excluídas. */
export function isVersionEditable(validFrom: string, today: string): boolean {
	return !!validFrom && validFrom.slice(0, 10) > today;
}

/** Vigente = a mais recente que já começou; as anteriores a ela são passadas. */
export function versionStatus(versions: RuleVersion[], validFrom: string, today: string): VersionStatus {
	const date = validFrom.slice(0, 10);
	if (date > today) {
		return "Future";
	}
	const currentDate = (versions ?? [])
		.map(v => v.ValidFrom.slice(0, 10))
		.filter(d => d <= today)
		.sort()
		.pop();
	return date === currentDate ? "Current" : "Past";
}

export function normalizeRule(raw: Raw): Rule {
	const versions = ((pick(raw, "Versions") as Raw[]) ?? []).map(v => ({
		Id: pick(v, "Id") as string,
		ValidFrom: text(pick(v, "ValidFrom")).slice(0, 10),
		Lines: ((pick(v, "Lines") as Raw[]) ?? []).map(l => ({
			CostCenterCode: text(pick(l, "CostCenterCode")),
			AccountingItemCode: text(pick(l, "AccountingItemCode")),
			Percentage: Number(pick(l, "Percentage"))
		}))
	}));
	versions.sort((a, b) => a.ValidFrom.localeCompare(b.ValidFrom));

	return {
		Code: text(pick(raw, "Code")),
		Name: text(pick(raw, "Name")),
		Inactive: pick(raw, "Inactive") === true,
		Versions: versions
	};
}

/** Código sem espaços e em maiúsculas; vazio vira texto vazio (o servidor lê "" como "sem código"). */
export function normalizeCode(code: string): string {
	return (code ?? "").trim().toUpperCase();
}

/**
 * Valida as linhas de uma versão antes de enviar. Devolve a mensagem pt-BR do primeiro problema,
 * ou texto vazio quando estão válidas. Cada linha precisa de centro de custo e/ou item contábil e de
 * percentual maior que zero; o par (centro, item) não pode se repetir; o total fecha em 100%.
 */
export function validateRuleLines(lines: RuleLine[]): string {
	if (!lines || lines.length === 0) {
		return "Informe ao menos uma linha na distribuição.";
	}

	const pairs = new Set<string>();

	for (const line of lines) {
		const center = normalizeCode(line.CostCenterCode);
		const item = normalizeCode(line.AccountingItemCode);

		if (!center && !item) {
			return "Informe o centro de custo ou o item contábil em cada linha.";
		}

		if (!(Number(line.Percentage) > 0)) {
			return "O percentual de cada linha deve ser maior que zero.";
		}

		const key = `${center}|${item}`;
		if (pairs.has(key)) {
			return "O par centro de custo/item contábil se repete na distribuição.";
		}
		pairs.add(key);
	}

	if (!isTotalValid(lines)) {
		return "Os percentuais das linhas devem somar exatamente 100%.";
	}

	return "";
}

/** Arrays paralelos exigidos pela action DistributionRulesSaveVersion. */
export function buildSaveVersionBody(code: string, validFrom: string, lines: RuleLine[]) {
	return {
		Code: code,
		ValidFrom: validFrom,
		LineCostCenterCodes: lines.map(l => normalizeCode(l.CostCenterCode)),
		LineAccountingItemCodes: lines.map(l => normalizeCode(l.AccountingItemCode)),
		LinePercentages: lines.map(l => Number(l.Percentage) || 0)
	};
}

/** Corpo do POST de DistributionRules: regra + primeira versão. */
export function buildCreateRuleBody(
	header: { Code: string; Name: string },
	validFrom: string,
	lines: RuleLine[]
) {
	const code = (header.Code ?? "").trim().toUpperCase();
	return {
		Code: code,
		Name: header.Name,
		Inactive: false,
		Versions: [{
			// RuleCode é string não anulável no servidor: sem ele o ModelState do POST recusa.
			RuleCode: code,
			ValidFrom: validFrom,
			Lines: lines.map(l => ({
				CostCenterCode: normalizeCode(l.CostCenterCode),
				AccountingItemCode: normalizeCode(l.AccountingItemCode),
				Percentage: Number(l.Percentage) || 0
			}))
		}]
	};
}

/** `yyyy-MM-dd` -> `dd/MM/yyyy`, sem passar por Date (evita deslocar o dia pelo fuso). */
export function formatIsoDateBr(iso: string): string {
	const [year, month, day] = (iso ?? "").slice(0, 10).split("-");
	return year && month && day ? `${day}/${month}/${year}` : "";
}

export function versionStatusText(status: VersionStatus): string {
	return status === "Future" ? "Futura" : status === "Current" ? "Vigente" : "Passada";
}
