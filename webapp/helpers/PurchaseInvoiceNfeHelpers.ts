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

/**
 * Filial que calcula tributos (regra ativa) e documento que o motor calcula: emissão própria ou terceiro Normal (spec
 * terceiro-chave D1). A devolução do cliente (terceiro + Devolução) fica sem natureza. Diferente de `isPurchaseNfeMode`,
 * que é só a emissão própria (travas de número/série/chave, emissão).
 */
export function isPurchaseTaxMode(taxLocked: boolean, issuerType: string, invoiceType: string): boolean {
	return taxLocked === true && (issuerType === "Own" || (issuerType === "ThirdParty" && invoiceType === "Normal"));
}

/** Chave da NF-e do fornecedor obrigatória: terceiro Normal do tipo NF-e na filial que emite pelo Siagro (spec terceiro-chave D3). */
export function requiresSupplierKey(
	doc: { IssuerType: string; InvoiceType: string; TaxDocumentKind: string }, taxLocked: boolean
): boolean {
	return taxLocked === true && doc.IssuerType === "ThirdParty" && doc.InvoiceType === "Normal" &&
		doc.TaxDocumentKind === "Nfe";
}

/**
 * Aviso de natureza faltando na entrada que calcula tributos: nomeia os produtos das linhas sem natureza (linha sem
 * produto aparece como "(sem produto)"; código repetido aparece uma vez).
 */
export function missingUsageMessage(itemCodes: string[]): string {
	const names = [...new Set(itemCodes.map((code) => (code ?? "").trim() || "(sem produto)"))];
	const subject = names.length === 1 ? "do item" : "dos itens";

	return `Informe a natureza de operação ${subject} ${names.join(", ")}: os tributos da entrada são calculados por ela.`;
}

/** "Autorizada na SEFAZ — protocolo X em dd/mm/aaaa hh:mm" (consulta do confirmar em Produção); vazio sem protocolo. */
export function supplierNfeAuthorizationText(protocol: string, checkedAt: string): string {
	if (!protocol) {
		return "";
	}

	const date = checkedAt ? new Date(checkedAt) : null;
	const when = date && !isNaN(date.getTime())
		? ` em ${date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
		: "";

	return `Autorizada na SEFAZ — protocolo ${protocol}${when}`;
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
 * digitado quando falta (1 a 990, sem repetir no documento). Só a entrada de terceiro valida o digitado: na própria
 * (`thirdParty` falso) a coluna não existe, então vai um 0 por chave e o servidor dá a mensagem certa. Quem decide de
 * verdade é o servidor.
 */
export function buildPurchaseItemNumbers(
	rows: PurchaseReturnItemRow[], keys: string[], thirdParty: boolean
): { ok: true; itemNumbers: number[] } | { ok: false; message: string } {
	if (thirdParty !== true) {
		return { ok: true, itemNumbers: keys.map(() => 0) };
	}

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
	"IbsStateValue,IbsMunicipalValue,NfeItemNumber,FreightValue,InsuranceValue,DiscountValue,OtherExpensesValue";
