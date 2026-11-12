/**
 * Resumo por fornecedor da Expedição de Grãos (GAC-1224).
 *
 * A function ShipmentReleasesGetPurchaseContracts devolve UMA linha por liberação, e cada
 * transferência de titularidade emite a sua — o armazém próprio acumula dezenas de linhas do
 * mesmo fornecedor. Aqui elas são agrupadas por fornecedor + previsão de pagamento para a tela
 * intermediária, e filtradas de volta quando o usuário escolhe um grupo. Tudo no cliente: a
 * consulta já traz o que é preciso, e a escolha final continua sendo de UMA liberação.
 */

export type ReleaseRow = {
	ShipmentReleaseKey: string;
	FCode: string;
	FName?: string;
	TaxId?: string;
	City?: string;
	State?: string;
	UnitOfMeasureCode?: string;
	StandardCashFlowDate?: string;
	AvailableQuantity: number;
};

export type SupplierSummaryRow = {
	FCode: string;
	FName: string;
	TaxId: string;
	City: string;
	State: string;
	UnitOfMeasureCode: string;
	/** Data original (ISO) da primeira liberação do grupo — para o formatter da tela. */
	StandardCashFlowDate: string;
	/** Dia da previsão (yyyy-MM-dd) ou "" quando o contrato não tem previsão. */
	CashFlowDateKey: string;
	ReleaseCount: number;
	AvailableQuantity: number;
};

/** Reduz a previsão de pagamento ao dia (yyyy-MM-dd); ausente vira "". */
export function cashFlowDateKey(value: string): string {
	return value ? value.substring(0, 10) : "";
}

export function summarizeReleasesBySupplier(rows: ReleaseRow[]): SupplierSummaryRow[] {
	const groups = new Map<string, SupplierSummaryRow>();

	(rows ?? []).forEach((row) => {
		const dateKey = cashFlowDateKey(row.StandardCashFlowDate);
		const groupKey = `${row.FCode}|${dateKey}`;
		const group = groups.get(groupKey);

		if (group) {
			group.ReleaseCount += 1;
			// Saldo tem 3 casas; arredondar a cada soma evita 0,1 + 0,2 = 0,30000000000000004.
			group.AvailableQuantity = Math.round((group.AvailableQuantity + row.AvailableQuantity) * 1000) / 1000;
			return;
		}

		groups.set(groupKey, {
			FCode: row.FCode,
			FName: row.FName ?? "",
			TaxId: row.TaxId ?? "",
			City: row.City ?? "",
			State: row.State ?? "",
			UnitOfMeasureCode: row.UnitOfMeasureCode ?? "",
			StandardCashFlowDate: row.StandardCashFlowDate ?? null,
			CashFlowDateKey: dateKey,
			ReleaseCount: 1,
			AvailableQuantity: row.AvailableQuantity,
		});
	});

	// Mesma ordem da lista de liberações: previsão mais próxima primeiro, sem data no fim.
	return Array.from(groups.values()).sort((a, b) => {
		if (!a.CashFlowDateKey !== !b.CashFlowDateKey) return a.CashFlowDateKey ? -1 : 1;
		if (a.CashFlowDateKey !== b.CashFlowDateKey) return a.CashFlowDateKey < b.CashFlowDateKey ? -1 : 1;
		return a.FName.localeCompare(b.FName, "pt-BR");
	});
}

/**
 * Liberações do grupo escolhido na Seleção de Fornecedor. Sem fornecedor (link antigo, aberto
 * direto na Seleção de Liberação) não filtra nada. Com fornecedor e sem data, devolve as
 * liberações SEM previsão de pagamento — é o grupo "sem data" do resumo.
 */
export function filterReleasesBySupplier<T extends ReleaseRow>(
	rows: T[],
	cardCode: string,
	dateKey: string
): T[] {
	const all = rows ?? [];
	if (!cardCode) return all;

	const wanted = dateKey ?? "";
	return all.filter((row) => row.FCode === cardCode && cashFlowDateKey(row.StandardCashFlowDate) === wanted);
}
