/**
 * Regras de distribuição: lógica pura das telas (total ao vivo, versão editável, payloads).
 * O REST devolve camelCase; o OData v4 devolve PascalCase - as duas formas são aceitas.
 */

export interface RuleLine {
	CostCenterCode: string;
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
	DimensionNumber: number;
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
			Percentage: Number(pick(l, "Percentage"))
		}))
	}));
	versions.sort((a, b) => a.ValidFrom.localeCompare(b.ValidFrom));

	return {
		Code: text(pick(raw, "Code")),
		Name: text(pick(raw, "Name")),
		DimensionNumber: Number(pick(raw, "DimensionNumber")),
		Inactive: pick(raw, "Inactive") === true,
		Versions: versions
	};
}

/** Arrays paralelos exigidos pela action DistributionRulesSaveVersion. */
export function buildSaveVersionBody(code: string, validFrom: string, lines: RuleLine[]) {
	return {
		Code: code,
		ValidFrom: validFrom,
		LineCostCenterCodes: lines.map(l => (l.CostCenterCode ?? "").trim().toUpperCase()),
		LinePercentages: lines.map(l => Number(l.Percentage) || 0)
	};
}

/** Corpo do POST de DistributionRules: regra + primeira versão. */
export function buildCreateRuleBody(
	header: { Code: string; Name: string; DimensionNumber: number },
	validFrom: string,
	lines: RuleLine[]
) {
	const code = (header.Code ?? "").trim().toUpperCase();
	return {
		Code: code,
		Name: header.Name,
		DimensionNumber: header.DimensionNumber,
		Inactive: false,
		Versions: [{
			// RuleCode é string não anulável no servidor: sem ele o ModelState do POST recusa.
			RuleCode: code,
			ValidFrom: validFrom,
			Lines: lines.map(l => ({
				CostCenterCode: (l.CostCenterCode ?? "").trim().toUpperCase(),
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
