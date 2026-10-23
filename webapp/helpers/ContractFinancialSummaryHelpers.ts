import { FinancialDocumentByContract } from "siagrob1/types/FinancialDocumentByContract";

/** Resumo da seção Financeiro do contrato (compra ou venda), calculado sobre as linhas já carregadas. */
export type ContractFinancialSummary = {
	HasRows: boolean;
	/** Provisórios + firmes (não cancelados). */
	TitlesAmount: number;
	SettledAmount: number;
	OpenAmount: number;
	/** Adiantamentos pagos e o crédito ainda não aplicado. */
	AdvanceAmount: number;
	AdvanceAvailable: number;
	/** Saldo a pagar/receber: em aberto menos o crédito de adiantamento disponível. */
	Balance: number;
	/** Informativos: retenções e devoluções em aberto (as devoluções já compensam firme/provisório). */
	WithholdingOpen: number;
	ReturnsOpen: number;
};

const num = (v: number | string): number => {
	const n = typeof v === "string" ? parseFloat(v) : v;
	return Number.isFinite(n) ? n : 0;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

export function contractFinancialSummary(rows: FinancialDocumentByContract[]): ContractFinancialSummary {
	let titles = 0, settled = 0, open = 0, advance = 0, available = 0, withholding = 0, returns = 0;

	for (const r of rows ?? []) {
		if (r.Status === "Canceled") continue;
		switch (r.Nature) {
			case "Provisional":
			case "Firm":
				titles += num(r.NetAmount);
				settled += num(r.SettledAmount);
				open += num(r.OpenAmount);
				break;
			case "Advance":
				advance += num(r.NetAmount);
				available += num(r.AvailableAdvanceAmount);
				break;
			case "TaxWithholding":
				withholding += num(r.OpenAmount);
				break;
			case "PurchaseReturn":
			case "SalesReturn":
				returns += num(r.OpenAmount);
				break;
		}
	}

	return {
		HasRows: (rows ?? []).length > 0,
		TitlesAmount: round2(titles),
		SettledAmount: round2(settled),
		OpenAmount: round2(open),
		AdvanceAmount: round2(advance),
		AdvanceAvailable: round2(available),
		Balance: round2(open - available),
		WithholdingOpen: round2(withholding),
		ReturnsOpen: round2(returns)
	};
}
