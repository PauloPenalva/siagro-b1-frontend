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

/** 44 dígitos (o resto é descartado) e dígito verificador mod 11, como o servidor confere. */
export function isValidAccessKey(value: string): boolean {
	const key = (value ?? "").replace(/\D/g, "");

	if (key.length !== 44) {
		return false;
	}

	let sum = 0;
	let weight = 2;
	for (let i = 42; i >= 0; i--) {
		sum += Number(key[i]) * weight;
		weight = weight === 9 ? 2 : weight + 1;
	}

	const digit = 11 - (sum % 11);
	return (digit >= 10 ? 0 : digit) === Number(key[43]);
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
