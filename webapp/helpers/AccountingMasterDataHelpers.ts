/**
 * Cadastros contábeis (centro de custo, item contábil): lógica pura das telas.
 * `Class` é o enum `AccountingEntityClass` do servidor (Synthetic = agrupa; Analytic = recebe lançamento).
 */

export type AccountingClass = "Synthetic" | "Analytic";

/** Texto pt-BR da classe; valor desconhecido ou vazio volta vazio. */
export function accountingClassText(value: string): string {
	return value === "Synthetic" ? "Sintético" : value === "Analytic" ? "Analítico" : "";
}
