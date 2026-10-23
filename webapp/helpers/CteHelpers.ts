/**
 * Regras puras das telas do CT-e (modelo 57): textos de situação/tomador/unidade, chave formatada,
 * $filter da lista, payload das ações TransportDocumentsSave/SendCorrection e BranchCteSettingsSave.
 * O OData v4 entrega os enums pelo nome (Status, Parties/Role); TakerRole é inteiro.
 */

const STATUS_TEXT: Record<string, string> = {
	Draft: "Rascunho",
	Confirmed: "Confirmado",
	Processing: "Em processamento",
	Authorized: "Autorizado",
	Rejected: "Rejeitado",
	Denied: "Denegado",
	Cancelled: "Cancelado",
	Voided: "Inutilizado",
};

const STATUS_STATE: Record<string, string> = {
	Confirmed: "Information",
	Processing: "Warning",
	Authorized: "Success",
	Rejected: "Error",
	Denied: "Error",
	Cancelled: "Error",
};

export const cteStatusText = (status: string): string => (status ? STATUS_TEXT[status] ?? status : "");
export const cteStatusState = (status: string): string => STATUS_STATE[status] ?? "None";

/** Papéis do participante na ordem do número do tomador (toma3 0..3, toma4 = 4). */
export const PARTY_ROLES = ["Sender", "Shipper", "Receiver", "Recipient", "OtherTaker"] as const;
export type CtePartyRoleName = typeof PARTY_ROLES[number];

const TAKER_TEXT = ["Remetente", "Expedidor", "Recebedor", "Destinatário", "Outros"];

export const takerRoleText = (role: number | string): string => {
	if (role === null || role === undefined || role === "") {
		return "";
	}
	return TAKER_TEXT[Number(role)] ?? String(role);
};

export const TAKER_ROLES = TAKER_TEXT.map((text, key) => ({ key: String(key), text }));

/** Unidades da quantidade da carga (cUnid). */
export const QUANTITY_UNITS = [
	{ key: "00", text: "00 - M3" },
	{ key: "01", text: "01 - KG" },
	{ key: "02", text: "02 - TON" },
	{ key: "03", text: "03 - UNIDADE" },
	{ key: "04", text: "04 - LITROS" },
	{ key: "05", text: "05 - MMBTU" },
];

export const quantityUnitText = (code: string): string =>
	QUANTITY_UNITS.find((u) => u.key === code)?.text ?? (code ?? "");

/** Chave de 44 dígitos em grupos de 4, como no DACTE. */
export const formatAccessKey = (key: string): string =>
	(key ?? "").replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");

type PartyLike = { Role: string; Name?: string };

export const partyNameByRole = (parties: PartyLike[], role: string): string =>
	(parties ?? []).find((p) => p.Role === role)?.Name ?? "";

export const takerName = (parties: PartyLike[], takerRole: number | string): string =>
	partyNameByRole(parties, PARTY_ROLES[Number(takerRole)]);

export const CTE_CANCEL_MIN = 15;
export const CTE_CANCEL_MAX = 255;

/** Justificativa do cancelamento: 15 a 255 caracteres após o trim (mesma conta do servidor). Vazio = válida. */
export const cancellationJustificationError = (text: string): string => {
	const length = (text ?? "").trim().length;
	return length >= CTE_CANCEL_MIN && length <= CTE_CANCEL_MAX
		? ""
		: `A justificativa deve ter de ${CTE_CANCEL_MIN} a ${CTE_CANCEL_MAX} caracteres.`;
};

/** Espelho de CteCorrectableFields do servidor (a lista fechada da CC-e). */
export const CTE_CORRECTABLE_FIELDS = [
	{ Group: "compl", Field: "xObs", Label: "Observações gerais", MaxLength: 500 },
	{ Group: "receb", Field: "xNome", Label: "Recebedor: nome", MaxLength: 60 },
	{ Group: "enderReceb", Field: "xLgr", Label: "Recebedor: logradouro", MaxLength: 255 },
	{ Group: "enderReceb", Field: "nro", Label: "Recebedor: número", MaxLength: 60 },
	{ Group: "enderReceb", Field: "xBairro", Label: "Recebedor: bairro", MaxLength: 60 },
	{ Group: "dest", Field: "xNome", Label: "Destinatário: nome", MaxLength: 60 },
	{ Group: "enderDest", Field: "xLgr", Label: "Destinatário: logradouro", MaxLength: 255 },
	{ Group: "enderDest", Field: "nro", Label: "Destinatário: número", MaxLength: 60 },
	{ Group: "enderDest", Field: "xBairro", Label: "Destinatário: bairro", MaxLength: 60 },
	{ Group: "infCarga", Field: "proPred", Label: "Produto predominante", MaxLength: 60 },
].map((f) => ({ ...f, Id: `${f.Group}|${f.Field}` }));

/** Linha do diálogo da CC-e: `FieldId` = "grupo|campo". */
export type CorrectionRow = { FieldId: string; Value: string };

const findField = (id: string) => CTE_CORRECTABLE_FIELDS.find((f) => f.Id === id);

export const correctionRowsError = (rows: CorrectionRow[]): string => {
	if (!rows?.length) {
		return "Informe ao menos um campo a corrigir.";
	}
	const seen = new Set<string>();
	for (const row of rows) {
		const field = findField(row.FieldId);
		const value = (row.Value ?? "").trim();
		if (!field || !value) {
			return "Informe o campo e o novo valor em todas as linhas.";
		}
		if (seen.has(field.Id)) {
			return `O campo ${field.Label} aparece mais de uma vez.`;
		}
		seen.add(field.Id);
		if (value.length > field.MaxLength) {
			return `${field.Label} aceita no máximo ${field.MaxLength} caracteres.`;
		}
	}
	return "";
};

export const buildCorrectionPayload = (key: string, rows: CorrectionRow[]) => ({
	Key: key,
	Groups: rows.map((r) => r.FieldId.split("|")[0]),
	Fields: rows.map((r) => r.FieldId.split("|")[1]),
	Values: rows.map((r) => (r.Value ?? "").trim()),
});

/** Participante do formulário (um por papel). */
export type CteFormParty = { CardCode: string; CardName: string };
export type CteFormQuantity = { UnitCode: string; MeasureType: string; Quantity: number | string };
export type CteFormComponent = { Name: string; Value: number | string };

/** Estado do formulário do CT-e (modelo JSON da tela). */
export interface TransportDocumentForm {
	Key: string;
	Status: string;
	Number: number;
	BranchCode: string;
	Series: number | string;
	UsageCode: number | string;
	TakerRole: number | string;
	Sender: CteFormParty;
	Shipper: CteFormParty;
	Receiver: CteFormParty;
	Recipient: CteFormParty;
	OtherTaker: CteFormParty;
	StartMunicipalityCode: string;
	EndMunicipalityCode: string;
	NfeKeys: { AccessKey: string }[];
	PredominantProduct: string;
	CargoValue: number | string;
	Quantities: CteFormQuantity[];
	Components: CteFormComponent[];
	VehicleMode: "Combination" | "Traction";
	TruckCombinationCode: string;
	TractionPlate: string;
	DriverCpf: string;
	InsuranceResponsible: string;
	InsurerTaxId: string;
	InsurerName: string;
	PolicyNumber: string;
	Tracked: boolean;
	OwnTransport: boolean;
	Observation: string;
	CostCenterCode: string;
	AccountingItemCode: string;
	DistributionRuleCode: string;
	/** Condição de pagamento do título a receber (sugerida do tomador). */
	PaymentConditionCode: string;
	/** Tributos (só leitura, recalculados pelo servidor ao gravar). */
	Taxes?: Record<string, unknown>;
}

const emptyParty = (): CteFormParty => ({ CardCode: "", CardName: "" });

export const emptyTransportDocumentForm = (branchCode: string, series: number): TransportDocumentForm => ({
	Key: "", Status: "Draft", Number: null, BranchCode: branchCode ?? "", Series: series ?? 1, UsageCode: null, TakerRole: "0",
	Sender: emptyParty(), Shipper: emptyParty(), Receiver: emptyParty(), Recipient: emptyParty(), OtherTaker: emptyParty(),
	StartMunicipalityCode: "", EndMunicipalityCode: "",
	NfeKeys: [], PredominantProduct: "", CargoValue: 0, Quantities: [], Components: [{ Name: "FRETE", Value: 0 }],
	VehicleMode: "Combination", TruckCombinationCode: "", TractionPlate: "", DriverCpf: "",
	InsuranceResponsible: "", InsurerTaxId: "", InsurerName: "", PolicyNumber: "",
	Tracked: true, OwnTransport: true, Observation: "",
	CostCenterCode: "", AccountingItemCode: "", DistributionRuleCode: "", PaymentConditionCode: "",
});

/** Documento lido do OData (com $expand dos filhos). */
export type TransportDocumentRead = Record<string, unknown> & {
	Parties?: { Role: string; CardCode?: string; Name?: string }[];
	NfeKeys?: { AccessKey: string; Order?: number }[];
	Quantities?: { UnitCode: string; MeasureType: string; Quantity: number }[];
	Components?: { Name: string; Value: number }[];
};

const str = (v: unknown): string =>
	v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v as string | number | boolean);

export const TAX_FIELDS = [
	"Cfop", "NatureText", "ServiceTotal", "AmountToReceive", "IcmsCst", "IcmsBase", "IcmsRate", "IcmsReduction", "IcmsValue",
	"IbsCbsCst", "IbsCbsClassCode", "IbsCbsBase", "CbsRate", "CbsValue", "IbsStateRate", "IbsStateValue",
	"IbsMunicipalRate", "IbsMunicipalValue",
];

export const transportDocumentFormFrom = (doc: TransportDocumentRead): TransportDocumentForm => {
	const form = emptyTransportDocumentForm(str(doc.BranchCode), Number(doc.Series));
	for (const p of doc.Parties ?? []) {
		if ((PARTY_ROLES as readonly string[]).includes(p.Role)) {
			form[p.Role as CtePartyRoleName] = { CardCode: str(p.CardCode), CardName: str(p.Name) };
		}
	}
	const taxes: Record<string, unknown> = {};
	TAX_FIELDS.forEach((f) => (taxes[f] = doc[f]));
	return {
		...form,
		Key: str(doc.Key),
		Status: str(doc.Status) || "Draft",
		Number: (doc.Number as number) ?? null,
		UsageCode: (doc.UsageCode as number) ?? null,
		TakerRole: str(doc.TakerRole ?? 0),
		StartMunicipalityCode: str(doc.StartMunicipalityCode),
		EndMunicipalityCode: str(doc.EndMunicipalityCode),
		NfeKeys: [...(doc.NfeKeys ?? [])].sort((a, b) => (a.Order ?? 0) - (b.Order ?? 0)).map((k) => ({ AccessKey: k.AccessKey })),
		PredominantProduct: str(doc.PredominantProduct),
		CargoValue: (doc.CargoValue as number) ?? 0,
		Quantities: (doc.Quantities ?? []).map((q) => ({ UnitCode: q.UnitCode, MeasureType: q.MeasureType, Quantity: q.Quantity })),
		Components: (doc.Components ?? []).map((c) => ({ Name: c.Name, Value: c.Value })),
		VehicleMode: doc.TruckCombinationCode ? "Combination" : "Traction",
		TruckCombinationCode: str(doc.TruckCombinationCode),
		TractionPlate: str(doc.TractionPlate),
		DriverCpf: str(doc.DriverCpf),
		InsuranceResponsible: str(doc.InsuranceResponsible),
		InsurerTaxId: str(doc.InsurerTaxId),
		InsurerName: str(doc.InsurerName),
		PolicyNumber: str(doc.PolicyNumber),
		Tracked: doc.Tracked !== false,
		OwnTransport: doc.OwnTransport !== false,
		Observation: str(doc.Observation),
		CostCenterCode: str(doc.CostCenterCode),
		AccountingItemCode: str(doc.AccountingItemCode),
		DistributionRuleCode: str(doc.DistributionRuleCode),
		PaymentConditionCode: str(doc.PaymentConditionCode),
		Taxes: taxes,
	};
};

const text = (v: unknown): string => {
	const s = str(v).trim();
	return s ? s : null;
};

/** Número digitado com vírgula ou ponto; vazio vira 0. */
const num = (v: unknown): number => {
	if (typeof v === "number") {
		return v;
	}
	const n = Number(str(v).trim().replace(",", "."));
	return Number.isFinite(n) ? n : 0;
};

const blank = (v: unknown) => str(v).trim() === "";

/** Corpo da ação TransportDocumentsSave: vetores paralelos, decimais como número (Double), opcionais nulos. */
export const buildTransportDocumentSavePayload = (form: TransportDocumentForm) => {
	const parties = PARTY_ROLES
		.map((role, index) => ({ index, code: str(form[role]?.CardCode).trim() }))
		.filter((p) => p.code);
	const quantities = (form.Quantities ?? []).filter((q) => !blank(q.UnitCode));
	const components = (form.Components ?? []).filter((c) => !blank(c.Name));
	const combination = form.VehicleMode === "Combination";

	return {
		Key: text(form.Key),
		BranchCode: str(form.BranchCode).trim(),
		Series: num(form.Series),
		UsageCode: blank(form.UsageCode) ? null : num(form.UsageCode),
		TakerRole: num(form.TakerRole),
		PartyRoles: parties.map((p) => p.index),
		PartyCardCodes: parties.map((p) => p.code),
		StartMunicipalityCode: text(form.StartMunicipalityCode),
		EndMunicipalityCode: text(form.EndMunicipalityCode),
		NfeKeys: (form.NfeKeys ?? []).map((k) => str(k.AccessKey).replace(/\D/g, "")).filter(Boolean),
		PredominantProduct: text(form.PredominantProduct),
		CargoValue: num(form.CargoValue),
		QuantityUnits: quantities.map((q) => q.UnitCode),
		QuantityMeasureTypes: quantities.map((q) => str(q.MeasureType).trim()),
		QuantityValues: quantities.map((q) => num(q.Quantity)),
		ComponentNames: components.map((c) => str(c.Name).trim()),
		ComponentValues: components.map((c) => num(c.Value)),
		TruckCombinationCode: combination ? text(form.TruckCombinationCode) : null,
		TractionPlate: combination ? null : text(form.TractionPlate)?.toUpperCase() ?? null,
		DriverCpf: text(str(form.DriverCpf).replace(/\D/g, "")),
		InsuranceResponsible: text(form.InsuranceResponsible),
		InsurerTaxId: text(str(form.InsurerTaxId).replace(/\D/g, "")),
		InsurerName: text(form.InsurerName),
		PolicyNumber: text(form.PolicyNumber),
		Tracked: form.Tracked !== false,
		OwnTransport: form.OwnTransport !== false,
		Observation: text(form.Observation),
		CostCenterCode: text(form.CostCenterCode),
		AccountingItemCode: text(form.AccountingItemCode),
		DistributionRuleCode: text(form.DistributionRuleCode),
		PaymentConditionCode: blank(form.PaymentConditionCode) ? null : num(form.PaymentConditionCode),
	};
};

/** Deslocamento do fuso local na data, no formato do literal DateTimeOffset ("-03:00"). */
export const localOffset = (date: Date): string => {
	const minutes = -date.getTimezoneOffset();
	const sign = minutes >= 0 ? "+" : "-";
	const abs = Math.abs(minutes);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

const localDate = (ymd: string): Date => {
	const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
	return new Date(y, m - 1, d);
};

const dateLiteral = (date: Date): string => {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00${localOffset(date)}`;
};

export type TransportDocumentsFilter = {
	DateFrom?: string; DateTo?: string; Status?: string;
	Taker?: string; Sender?: string; Recipient?: string; Plate?: string;
	/** "yes" = averbado, "no" = não averbado, vazio = todos. */
	Endorsed?: string;
};

const esc = (value: string) => value.replace(/'/g, "''");

/**
 * $filter cru da lista (enum não passa por sap.ui.model.Filter). Emissão é DateTimeOffset: o "até"
 * vira "< dia seguinte" para incluir o dia todo. O tomador casa o papel com o TakerRole do documento.
 */
export const buildTransportDocumentsFilter = (f: TransportDocumentsFilter): string => {
	const parts: string[] = [];
	if (f.DateFrom) {
		parts.push(`IssuedAt ge ${dateLiteral(localDate(f.DateFrom))}`);
	}
	if (f.DateTo) {
		const next = localDate(f.DateTo);
		next.setDate(next.getDate() + 1);
		parts.push(`IssuedAt lt ${dateLiteral(next)}`);
	}
	if (f.Status) {
		parts.push(`Status eq '${esc(f.Status)}'`);
	}
	const taker = f.Taker?.trim();
	if (taker) {
		const roles = PARTY_ROLES.map((role, i) => `(p/Role eq '${role}' and $it/TakerRole eq ${i})`).join(" or ");
		parts.push(`Parties/any(p:contains(p/Name,'${esc(taker)}') and (${roles}))`);
	}
	for (const [key, role] of [["Sender", "Sender"], ["Recipient", "Recipient"]] as const) {
		const value = f[key]?.trim();
		if (value) {
			parts.push(`Parties/any(p:p/Role eq '${role}' and contains(p/Name,'${esc(value)}'))`);
		}
	}
	const plate = f.Plate?.trim();
	if (plate) {
		parts.push(`contains(TractionPlate,'${esc(plate.toUpperCase())}')`);
	}
	if (f.Endorsed === "yes") {
		parts.push("EndorsementStatus eq 'Endorsed'");
	} else if (f.Endorsed === "no") {
		parts.push("EndorsementStatus ne 'Endorsed'");
	}
	return parts.length ? parts.join(" and ") : undefined;
};

/** Linha de série do CT-e na configuração. */
export type CteSeriesRow = { Series: number | string; Description: string; NextNumber: number | string; IsUsed: boolean; isNew: boolean };

export type CteSettingsForm = {
	BranchCode: string; Enabled: boolean; Environment: string; DefaultSeries: number | string;
	DefaultQuantityUnit: string; SeriesList: CteSeriesRow[];
};

/** Corpo do BranchCteSettingsSave: ambiente pelo número do enum (1 produção, 2 homologação). */
export const buildCteSettingsSavePayload = (s: CteSettingsForm) => ({
	BranchCode: s.BranchCode,
	Enabled: s.Enabled === true,
	Environment: s.Environment === "Production" ? 1 : 2,
	DefaultSeries: Number(s.DefaultSeries),
	DefaultQuantityUnit: s.DefaultQuantityUnit || "00",
	Series: (s.SeriesList ?? []).map((r) => Number(r.Series)),
	Descriptions: (s.SeriesList ?? []).map((r) => (r.Description ?? "").trim()),
	NextNumbers: (s.SeriesList ?? []).map((r) => Number(r.NextNumber)),
});

/** Botões do Detalhe conforme a situação (as mesmas travas dos serviços). */
export const cteActions = (status: string, number: number) => ({
	edit: status === "Draft" || status === "Rejected",
	confirm: status === "Draft",
	reopen: status === "Confirmed",
	transmit: status === "Confirmed" || status === "Rejected" || status === "Processing",
	consult: status === "Processing" || status === "Rejected" || status === "Confirmed" || status === "Authorized",
	dacte: status === "Authorized" || status === "Cancelled",
	cancel: status === "Authorized",
	correction: status === "Authorized",
	discardNumber: (status === "Draft" || status === "Confirmed" || status === "Rejected") && number !== null && number !== undefined,
	delete: status === "Draft" && (number === null || number === undefined),
});

const PARTY_ROLE_TEXT: Record<string, string> = {
	Sender: "Remetente", Shipper: "Expedidor", Receiver: "Recebedor", Recipient: "Destinatário", OtherTaker: "Tomador (outros)",
};

/** Papel do participante pelo nome do enum CtePartyRole. */
export const partyRoleText = (role: string): string => (role ? PARTY_ROLE_TEXT[role] ?? role : "");

/** Desfecho da SEFAZ (StatusCode/Reason): 100/150 autorizado (150 = fora de prazo), 101/135 evento registrado, 102 inutilizado. */
export const sefazOutcome = (status: { StatusCode: number; Reason: string }): { ok: boolean; text: string } => ({
	ok: [100, 150, 101, 102, 135, 136, 155].includes(Number(status?.StatusCode)),
	text: `${status?.StatusCode ?? ""} - ${status?.Reason ?? ""}`,
});

/** $expand dos filhos com $select explícito (lição do sub-projeto 2). */
export const TRANSPORT_DOCUMENT_EXPAND =
	"$expand=Parties($select=Role,CardCode,Name),NfeKeys($select=AccessKey,Order)," +
	"Quantities($select=UnitCode,MeasureType,Quantity),Components($select=Name,Value)";

const ENDORSEMENT_TEXT: Record<string, string> = {
	None: "Não averbado", Endorsed: "Averbado", CancellationPending: "Cancelamento pendente", Cancelled: "Averbação cancelada",
};
const ENDORSEMENT_STATE: Record<string, string> = {
	Endorsed: "Success", CancellationPending: "Warning", Cancelled: "Information",
};

/** Situação da averbação (enum CteEndorsementStatus). */
export const endorsementStatusText = (status: string): string => (status ? ENDORSEMENT_TEXT[status] ?? status : "");
export const endorsementStatusState = (status: string): string => ENDORSEMENT_STATE[status] ?? "None";

/** Averbação é manual: só CT-e autorizado, ainda não averbado, com a AT&M ligada na filial. */
export const canEndorse = (status: string, endorsementStatus: string, averbaEnabled: boolean): boolean =>
	status === "Authorized" && (!endorsementStatus || endorsementStatus === "None") && averbaEnabled === true;

export const CTE_BATCH_MAX = 200;

/** Lote (transmitir/averbar/baixar): de 1 a 200 CT-e. Vazio = ok. */
export const batchSelectionError = (count: number): string => {
	if (!count || count < 1) {
		return "Selecione ao menos um CT-e.";
	}
	return count > CTE_BATCH_MAX ? `Selecione no máximo ${CTE_BATCH_MAX} CT-e por vez.` : "";
};
