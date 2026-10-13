import { PurchaseContractsTotals } from "siagrob1/types/PurchaseContractsTotal";

export type FunruralRow = { Tax: string, Base: number, Rate: number, Value: number };
export type FunruralSummary = { rows: FunruralRow[], total: number, net: number };

/**
 * Quadro "Impostos" do contrato de compra em STANDALONE (spec 2026-10-13): as parcelas de Funrural que o backend
 * calculou pela natureza do complemento fiscal. Parcela de valor zero some, como no quadro "Tributos" da Entrada.
 */
export function summarizeContractFunrural(totals: PurchaseContractsTotals): FunruralSummary {
	const base = totals.FunruralBase ?? 0;
	const parts: FunruralRow[] = [
		{ Tax: "Funrural - INSS", Base: base, Rate: totals.FunruralInssRate ?? 0, Value: totals.FunruralInssValue ?? 0 },
		{ Tax: "Funrural - RAT", Base: base, Rate: totals.FunruralRatRate ?? 0, Value: totals.FunruralRatValue ?? 0 },
		{ Tax: "Funrural - SENAR", Base: base, Rate: totals.FunruralSenarRate ?? 0, Value: totals.FunruralSenarValue ?? 0 },
	];

	return {
		rows: parts.filter((p) => p.Value !== 0),
		total: totals.TotalFunrural ?? 0,
		net: totals.NetToProducer ?? base,
	};
}

/** Valor monetário pt-BR com 2 casas, para o quadro. */
export function formatFunruralAmount(value: number): string {
	return (value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Alíquota pt-BR com até 4 casas. */
export function formatFunruralRate(value: number): string {
	return (value ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
