import type { AccountingDimension, DimensionItem, DimsModelData } from "siagrob1/types/AccountingDimension";

const DIMENSION_COUNT = 5;

/**
 * Monta o conteúdo do model `dims`: sempre 5 linhas ordenadas por Number, para que
 * `{dims>/items/N/...}` (N = número - 1) funcione mesmo quando o servidor devolve menos linhas.
 * Dimensão ausente fica inativa.
 */
export function buildDimsModel(rows: AccountingDimension[]): DimsModelData {
	const byNumber = new Map<number, DimensionItem>();

	for (const row of rows ?? []) {
		const number = Number(row.Number ?? row.number);
		if (!Number.isInteger(number) || number < 1 || number > DIMENSION_COUNT) {
			continue;
		}

		byNumber.set(number, {
			Number: number,
			Name: row.Name ?? row.name ?? "",
			Active: (row.Active ?? row.active) === true,
			Role: row.Role ?? row.role ?? "None"
		});
	}

	const items: DimensionItem[] = [];
	for (let n = 1; n <= DIMENSION_COUNT; n++) {
		items.push(byNumber.get(n) ?? { Number: n, Name: "", Active: false, Role: "None" });
	}

	const partnerItem = items.find(item => item.Active && item.Role === "Partner");

	return {
		items,
		partner: {
			exists: partnerItem !== undefined,
			number: partnerItem?.Number ?? 0,
			label: partnerItem ? `Padrão de ${partnerItem.Name}` : ""
		}
	};
}

function find(dims: DimsModelData, n: number): DimensionItem {
	return dims?.items?.find(item => item.Number === n);
}

/** A dimensão `n` aparece nas telas quando está ativa. */
export function isVisible(dims: DimsModelData, n: number): boolean {
	return find(dims, n)?.Active === true;
}

/** Nome configurado da dimensão `n` (rótulo do campo). */
export function label(dims: DimsModelData, n: number): string {
	return find(dims, n)?.Name ?? "";
}

/** Número da dimensão ativa com o papel informado (Vehicle/Partner), ou undefined. */
export function dimensionForRole(dims: DimsModelData, role: string): number {
	return dims?.items?.find(item => item.Active && item.Role === role)?.Number;
}
