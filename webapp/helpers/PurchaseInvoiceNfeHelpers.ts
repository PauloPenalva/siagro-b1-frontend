/**
 * Regras de tela da NF-e do Documento de Entrada (spec 2026-10-05), puras para poderem ser testadas sem view.
 * Quem decide de verdade é o servidor; isto só esconde o botão que voltaria recusado.
 */
export type PurchaseNfeState = {
	InvoiceStatus: string;
	InvoiceType: string;
	IssuerType: string;
	IsNfeReturn: boolean;
	NfeStatus: string;
	ChaveNFe?: string;
};

/** Modo NF-e: a filial emite pelo Siagro (regra ativa) e o documento é de emissão própria. */
export function isPurchaseNfeMode(taxLocked: boolean, issuerType: string): boolean {
	return taxLocked === true && issuerType === "Own";
}

/** Entrada própria Normal ou devolução de compra, Pendente, sem NF-e ou com a anterior rejeitada. */
export function canIssuePurchaseNfe(doc: PurchaseNfeState, nfeMode: boolean): boolean {
	const issuable = doc.InvoiceType === "Normal" || (doc.InvoiceType === "Return" && doc.IsNfeReturn === true);
	return nfeMode === true && issuable && doc.InvoiceStatus === "Pending" &&
		(doc.NfeStatus === "None" || doc.NfeStatus === "Rejected" || !doc.NfeStatus);
}

/** "Devolver": entrada própria Normal, confirmada, com NF-e autorizada. */
export function canReturnPurchase(doc: PurchaseNfeState, nfeMode: boolean): boolean {
	return nfeMode === true && doc.InvoiceType === "Normal" && doc.IsNfeReturn !== true &&
		doc.InvoiceStatus === "Confirmed" && doc.NfeStatus === "Authorized";
}

/** "Devolver" da entrada de TERCEIRO (NF-e do fornecedor): filial que emite pelo Siagro, Normal, confirmada, com a chave. */
export function canReturnThirdPartyPurchase(doc: PurchaseNfeState, taxLocked: boolean): boolean {
	return taxLocked === true && doc.IssuerType === "ThirdParty" && doc.InvoiceType === "Normal" &&
		doc.InvoiceStatus === "Confirmed" && /^\d{44}$/.test(doc.ChaveNFe ?? "");
}

/** Linha do diálogo "Devolver" no que toca ao nItem da nota de origem. */
export type PurchaseReturnItemRow = {
	OriginItemKey: string;
	ItemCode: string;
	/** nItem já gravado na linha de origem; nulo na entrada de terceiro sem o número. */
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks desligado; null é intencional
	ItemNumber: number | null;
	/** O que o usuário digitou quando falta o número. */
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- strictNullChecks desligado; null é intencional
	TypedItemNumber: number | null;
};

/**
 * `ItemNumbers` da action, paralelo a `keys`: 0 quando a linha de origem já tem o número (o servidor usa o dela), o
 * digitado quando falta (1 a 990, sem repetir no documento). Quem decide de verdade é o servidor.
 */
export function buildPurchaseItemNumbers(
	rows: PurchaseReturnItemRow[], keys: string[]
): { ok: true; itemNumbers: number[] } | { ok: false; message: string } {
	const present = (value: number) => value !== null && value !== undefined;
	const used = new Set(rows.filter((r) => present(r.ItemNumber)).map((r) => Number(r.ItemNumber)));
	const itemNumbers: number[] = [];

	for (const key of keys) {
		const row = rows.find((r) => r.OriginItemKey === key);

		if (!row || present(row.ItemNumber)) {
			itemNumbers.push(0);
			continue;
		}

		const typed = present(row.TypedItemNumber) ? Number(row.TypedItemNumber) : NaN;

		if (!Number.isInteger(typed) || typed < 1 || typed > 990) {
			return { ok: false, message: `Item ${row.ItemCode}: informe o número do item na NF-e do fornecedor.` };
		}

		if (used.has(typed)) {
			return { ok: false, message: `Item ${row.ItemCode}: o número ${typed} já é de outro item desta NF-e do fornecedor.` };
		}

		used.add(typed);
		itemNumbers.push(typed);
	}

	return { ok: true, itemNumbers };
}

/**
 * Na filial que emite NF-e pelo Siagro, a devolução de compra própria só nasce pelo "Devolver" (o servidor recusa
 * a manual). Enquanto o tipo ainda é escolhível (inclusão), uma Devolução marcada antes de virar Emissão Própria
 * volta para Normal. A devolução do cliente (De terceiro) e a filial sem NF-e seguem escolhendo o tipo.
 */
export function mustFallBackToNormal(invoiceType: string, isNfeReturn: boolean, nfeMode: boolean, typeEditable: boolean): boolean {
	return nfeMode === true && typeEditable === true && invoiceType === "Return" && isNfeReturn !== true;
}

/**
 * $select das linhas no Detail/Edit. Explícito porque as colunas fiscais só aparecem no modo NF-e — informação
 * que ainda não chegou quando o UI5 monta o $select automático — e o diálogo fiscal lê a fotografia inteira.
 */
export const PURCHASE_ITEM_SELECT =
	"Key,ItemCode,ItemName,UnitOfMeasureCode,Quantity,UnitPrice,Total,AssessedShortage,Difference," +
	"SalesInvoiceItemKey,PurchaseContractKey,PurchaseInvoiceItemOriginKey,UsageCode,UsageName,Cfop,Ncm,GoodsOrigin," +
	"CstIcms,IcmsBase,IcmsRate,IcmsValue,IcmsBaseReduction,IcmsDeferral,IcmsOperationValue,IcmsDeferredValue," +
	"IcmsBenefitCode,CstPis,PisBase,PisRate,PisValue,CstCofins,CofinsBase,CofinsRate,CofinsValue,IbsCbsCst," +
	"IbsCbsClassCode,IbsCbsBase,CbsRate,CbsRateReduction,CbsValue,IbsStateRate,IbsMunicipalRate,IbsRateReduction," +
	"IbsStateValue,IbsMunicipalValue,NfeItemNumber";
