/** Linha do diálogo "Complementar ICMS": um item da venda e a base/ICMS a complementar. */
export type IcmsComplementRow = {
	OriginItemKey: string;
	ItemCode: string;
	ItemName: string;
	Quantity: number;
	Total: number;
	/** O que o usuário digitou; o tipo Float do campo entrega número, ou null se apagado. */
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks desligado; null é intencional
	IcmsBase: number | null;
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks desligado; null é intencional
	IcmsValue: number | null;
};

/** Item da venda como o Detail o lê. */
export type SalesInvoiceItemLike = { Key: string; ItemCode: string; ItemName?: string; Quantity: number; Total: number };

/** Corpo de SalesInvoicesCreateIcmsComplement, sem a Key (arrays PARALELOS). */
export type IcmsComplementPayload = { OriginItemKeys: string[]; IcmsBases: number[]; IcmsValues: number[] };

/** Estado do documento que decide se "Complementar ICMS" aparece (mesma regra do servidor). */
export type IcmsComplementState = {
	InvoiceType: string;
	InvoiceStatus: string;
	NfeStatus: string;
	TaxDocumentKind: string;
	/** `ui>/taxLocked`: a filial emite pelo Siagro (regra fiscal ativa). */
	taxLocked: boolean;
};

/** Abre o diálogo com uma linha por item da venda, base e ICMS zerados. */
export function complementRowsFrom(items: SalesInvoiceItemLike[]): IcmsComplementRow[] {
	return items.map((i) => ({
		OriginItemKey: i.Key, ItemCode: i.ItemCode, ItemName: i.ItemName ?? "", Quantity: Number(i.Quantity),
		Total: Number(i.Total), IcmsBase: 0, IcmsValue: 0,
	}));
}

function toAmount(value: number): number {
	const n = Number(value ?? 0);
	return Number.isNaN(n) || n < 0 ? 0 : n;
}

/** Monta o corpo da action. Linha com base e valor zerados fica de fora; quem valida de verdade é o servidor. */
export function buildIcmsComplementPayload(rows: IcmsComplementRow[]): IcmsComplementPayload {
	const payload: IcmsComplementPayload = { OriginItemKeys: [], IcmsBases: [], IcmsValues: [] };

	for (const row of rows) {
		const base = toAmount(row.IcmsBase);
		const value = toAmount(row.IcmsValue);

		if (base > 0 || value > 0) {
			payload.OriginItemKeys.push(row.OriginItemKey);
			payload.IcmsBases.push(base);
			payload.IcmsValues.push(value);
		}
	}

	return payload;
}

/** Só a venda Normal, Confirmada, com NF-e Autorizada, emitida pelo Siagro, pode ser complementada. */
export function canComplementIcms(state: IcmsComplementState): boolean {
	return !!state
		&& state.InvoiceType === "Normal"
		&& state.InvoiceStatus === "Confirmed"
		&& state.NfeStatus === "Authorized"
		&& state.TaxDocumentKind === "Nfe"
		&& state.taxLocked === true;
}
