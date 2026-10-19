import { localIsoDate } from "siagrob1/helpers/DateHelpers";

/**
 * Linha de movimento da conta financeira como as functions FinancialAccountsGetMovements e
 * FinancialAccountReconciliationsGetLines devolvem. `Amount` já vem no sinal de caixa (+ entra, − sai).
 * `Source`: o OData serializa o enum pelo nome ("Settlement" | "Manual"); aceitar o número também é defesa.
 */
export type MovementRow = {
	Source: "Settlement" | "Manual" | 0 | 1;
	Key: string;
	Date: string;
	Amount: number | string;
	Description: string;
	DocumentReference?: string;
	CardCode?: string;
	CardName?: string;
	FinancialDocumentKey?: string;
	ReconciliationKey?: string;
	Reconciled: boolean;
	Marked: boolean;
	RunningBalance: number | string;
};

export type ReconciliationChanges = {
	MarkSettlements: string[];
	MarkEntries: string[];
	UnmarkSettlements: string[];
	UnmarkEntries: string[];
};

/** Primeiro e último dia do mês de `today`, em `yyyy-MM-dd` pelo calendário local (nunca toISOString). */
export function monthRange(today: Date): { from: string; to: string } {
	return {
		from: localIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
		to: localIsoDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
	};
}

/** Valor digitado (sempre positivo) com o sinal do tipo escolhido. Valor não positivo vira NaN. */
export function signedEntryAmount(type: "In" | "Out", value: number): number {
	const amount = Number(value);
	if (!(amount > 0)) return NaN;
	return type === "Out" ? -amount : amount;
}

export function isManual(row: MovementRow): boolean {
	return row?.Source === "Manual" || row?.Source === 1;
}

/** Exclusão só de lançamento manual NÃO conciliado — conciliado fica bloqueado. */
export function canDeleteEntry(row: MovementRow): boolean {
	return !!row && isManual(row) && !row.Reconciled;
}

/** Diferença entre o que estava marcado e o que está selecionado agora, separada por fonte. */
export function reconciliationChanges(rows: MovementRow[], selectedKeys: Set<string>): ReconciliationChanges {
	const changes: ReconciliationChanges = { MarkSettlements: [], MarkEntries: [], UnmarkSettlements: [], UnmarkEntries: [] };

	for (const row of rows) {
		const selected = selectedKeys.has(row.Key);
		if (selected === row.Marked) continue;

		const manual = isManual(row);
		if (selected) (manual ? changes.MarkEntries : changes.MarkSettlements).push(row.Key);
		else (manual ? changes.UnmarkEntries : changes.UnmarkSettlements).push(row.Key);
	}

	return changes;
}
