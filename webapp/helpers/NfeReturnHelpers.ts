/** O que o diálogo "Devolver" usa de cada linha — comum à venda e à compra. */
export type ReturnableRow = {
	OriginItemKey: string;
	ItemCode: string;
	Returnable: number;
	/** O que o usuário digitou; o tipo Float do campo entrega número, ou null se apagado. */
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks desligado; null é intencional
	ReturnQuantity: number | null;
};

/** Linha do diálogo "Devolver": um item da venda e quanto dele ainda pode voltar. */
export type NfeReturnRow = ReturnableRow & {
	ItemName: string;
	SoldQuantity: number;
	ReturnedQuantity: number;
};

/** Corpo de SalesInvoicesCreateNfeReturn, sem a Key (arrays PARALELOS). */
export type NfeReturnPayload = { OriginItemKeys: string[]; Quantities: number[]; Reason: string };

/** Abre o diálogo com o saldo de cada item já preenchido: a devolução total é o caso comum. */
export function prefillNfeReturnRows<T extends ReturnableRow>(rows: T[]): T[] {
	return rows.map((r) => ({ ...r, ReturnQuantity: r.Returnable }));
}

export function hasReturnableBalance(rows: ReturnableRow[]): boolean {
	return rows.some((r) => Number(r.Returnable) > 0);
}

/**
 * Valida o diálogo e monta o corpo da action. Item com zero (ou apagado) fica de fora. Quem decide de
 * verdade é o servidor; isto só evita uma ida que voltaria recusada.
 */
export function buildNfeReturnPayload(
	rows: ReturnableRow[], reason: string
): { ok: true; payload: NfeReturnPayload } | { ok: false; message: string } {
	const text = (reason ?? "").trim();

	if (text === "") {
		return { ok: false, message: "Informe o motivo da devolução." };
	}

	const keys: string[] = [];
	const quantities: number[] = [];

	for (const row of rows) {
		const quantity = row.ReturnQuantity === null || row.ReturnQuantity === undefined ? 0 : Number(row.ReturnQuantity);

		if (Number.isNaN(quantity) || quantity < 0) {
			return { ok: false, message: `Item ${row.ItemCode}: quantidade inválida.` };
		}

		if (quantity > Number(row.Returnable) + 0.0005) {
			return { ok: false, message: `Item ${row.ItemCode}: a quantidade a devolver passa do saldo (${row.Returnable}).` };
		}

		if (quantity > 0) {
			keys.push(row.OriginItemKey);
			quantities.push(quantity);
		}
	}

	if (keys.length === 0) {
		return { ok: false, message: "Informe a quantidade a devolver de ao menos um item." };
	}

	return { ok: true, payload: { OriginItemKeys: keys, Quantities: quantities, Reason: text } };
}
