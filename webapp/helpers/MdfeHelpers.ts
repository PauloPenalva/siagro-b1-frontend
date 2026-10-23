/**
 * Regras puras das telas do MDF-e (modelo 58): textos de situação/unidade/tipo de carga, $filter da
 * lista, filtro dos CT-e elegíveis, payload das ações TransportManifestsSave e BranchMdfeSettingsSave.
 * O OData v4 entrega o enum MdfeStatus pelo nome.
 */
import { formatAccessKey, localOffset } from "siagrob1/helpers/CteHelpers";

export { formatAccessKey };

const STATUS_TEXT: Record<string, string> = {
	Draft: "Rascunho",
	Confirmed: "Confirmado",
	Processing: "Em processamento",
	Authorized: "Autorizado — não encerrado",
	Rejected: "Rejeitado",
	Denied: "Denegado",
	Cancelled: "Cancelado",
	Voided: "Inutilizado",
	Closed: "Encerrado",
};

const STATUS_STATE: Record<string, string> = {
	Confirmed: "Information",
	Processing: "Warning",
	Authorized: "Warning",
	Closed: "Success",
	Rejected: "Error",
	Denied: "Error",
	Cancelled: "Error",
};

export const mdfeStatusText = (status: string): string => (status ? STATUS_TEXT[status] ?? status : "");
export const mdfeStatusState = (status: string): string => STATUS_STATE[status] ?? "None";

export const MDFE_STATUSES = Object.keys(STATUS_TEXT).map((key) => ({ key, text: STATUS_TEXT[key] }));

export const WEIGHT_UNITS = [{ key: "01", text: "KG" }, { key: "02", text: "TON" }];
export const weightUnitText = (code: string): string => WEIGHT_UNITS.find((u) => u.key === code)?.text ?? (code ?? "");

/** tpCarga do manual do MDF-e. */
export const CARGO_TYPES = [
	{ key: "01", text: "Granel sólido" },
	{ key: "02", text: "Granel líquido" },
	{ key: "03", text: "Frigorificada" },
	{ key: "04", text: "Conteinerizada" },
	{ key: "05", text: "Carga geral" },
	{ key: "06", text: "Neogranel" },
	{ key: "07", text: "Perigosa (granel sólido)" },
	{ key: "08", text: "Perigosa (granel líquido)" },
	{ key: "09", text: "Perigosa (carga frigorificada)" },
	{ key: "10", text: "Perigosa (conteinerizada)" },
	{ key: "11", text: "Perigosa (carga geral)" },
];
export const cargoTypeText = (code: string): string => CARGO_TYPES.find((c) => c.key === code)?.text ?? (code ?? "");

/** CIOT: obrigatório (12 dígitos) — o MDF-e sempre leva o RNTRC e a SEFAZ rejeita sem CIOT (684). */
export const ciotError = (text: string): string => {
	const value = (text ?? "").trim();
	if (!value) {
		return "CIOT obrigatório no MDF-e quando há RNTRC (rejeição 684 da SEFAZ): informe o CIOT e o responsável.";
	}
	return /^\d{12}$/.test(value) ? null : "O CIOT deve ter 12 dígitos.";
};

/** Responsável pelo CIOT: CPF (11) ou CNPJ (14) dígitos, obrigatório. */
export const ciotResponsibleError = (text: string): string => {
	const length = (text ?? "").replace(/\D/g, "").length;
	return length === 11 || length === 14 ? null : "Informe o CPF ou CNPJ do responsável pelo CIOT.";
};

/** NCM do produto predominante: 8 dígitos, obrigatório na carga lotação (um único CT-e; rejeição 301). */
export const ncmError = (text: string, cteCount: number): string => {
	const length = (text ?? "").replace(/\D/g, "").length;
	if (cteCount !== 1 && length === 0) {
		return null;
	}
	return length === 8 ? null : "Carga lotação: informe o NCM do produto predominante (8 dígitos).";
};

/** Vínculo do CT-e com o MDF-e (função TransportDocumentsManifest). */
export type CteManifestLink = { ManifestKey: string; Number: number; Series: number; Status: string };
export const manifestLinkText = (link: CteManifestLink): string =>
	link?.ManifestKey ? `${link.Number ?? "(sem número)"}/${link.Series} (${mdfeStatusText(link.Status)})` : "";

/** Botões do Detalhe conforme a situação (as travas dos serviços do MDF-e). */
export const mdfeActions = (status: string, number: number) => {
	const hasNumber = number !== null && number !== undefined;
	return {
		edit: status === "Draft" || status === "Rejected",
		confirm: status === "Draft",
		reopen: status === "Confirmed",
		transmit: status === "Confirmed" || status === "Rejected" || status === "Processing",
		consult: status === "Processing" || status === "Rejected" || status === "Confirmed" || status === "Authorized",
		close: status === "Authorized",
		damdfe: status === "Authorized" || status === "Closed" || status === "Cancelled",
		discardNumber: (status === "Draft" || status === "Confirmed" || status === "Rejected") && hasNumber,
		delete: status === "Draft" && !hasNumber,
		cancel: status === "Authorized",
		includeDriver: status === "Authorized",
	};
};

// ---------- lista ----------

export type TransportManifestsFilter = {
	DateFrom?: string; DateTo?: string; Statuses?: string[]; Plate?: string; Driver?: string; OnlyOpen?: boolean;
};

const esc = (value: string) => value.replace(/'/g, "''");

const localDate = (ymd: string): Date => {
	const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
	return new Date(y, m - 1, d);
};

const dateLiteral = (date: Date): string => {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00${localOffset(date)}`;
};

/** $filter cru da lista (enum não passa por sap.ui.model.Filter); "até" vira "< dia seguinte". */
export const buildTransportManifestsFilter = (f: TransportManifestsFilter): string => {
	const parts: string[] = [];
	if (f.DateFrom) {
		parts.push(`IssuedAt ge ${dateLiteral(localDate(f.DateFrom))}`);
	}
	if (f.DateTo) {
		const next = localDate(f.DateTo);
		next.setDate(next.getDate() + 1);
		parts.push(`IssuedAt lt ${dateLiteral(next)}`);
	}
	if (f.OnlyOpen) {
		parts.push("Status eq SiagroB1.Domain.Enums.MdfeStatus'Authorized'");
	} else if (f.Statuses?.length) {
		parts.push(`(${f.Statuses.map((s) => `Status eq '${esc(s)}'`).join(" or ")})`);
	}
	const plate = f.Plate?.trim();
	if (plate) {
		parts.push(`contains(TractionPlate,'${esc(plate.toUpperCase())}')`);
	}
	const driver = f.Driver?.trim();
	if (driver) {
		parts.push(`contains(DriverName,'${esc(driver)}')`);
	}
	return parts.length ? parts.join(" and ") : undefined;
};

// ---------- inclusão ----------

/** Averbação do CT-e (CteEndorsementStatus): o enum chega como nome ("Endorsed") ou número (1). */
export const isEndorsed = (status: unknown): boolean => status === "Endorsed" || status === 1 || status === "1";
export const endorsementText = (status: unknown): string => (isEndorsed(status) ? "Averbado" : "Não averbado");
export const endorsementState = (status: unknown): string => (isEndorsed(status) ? "Success" : "Warning");

/** "Averbe os CT-e antes de incluir no MDF-e: 2, 3." — vazio quando todos estão averbados (a SEFAZ rejeita sem nAver). */
export const notEndorsedMessage = (rows: { Number?: number; EndorsementStatus?: unknown }[]): string => {
	const missing = rows.filter((r) => !isEndorsed(r.EndorsementStatus)).map((r) => r.Number ?? "?");
	return missing.length ? `Averbe os CT-e antes de incluir no MDF-e: ${missing.join(", ")}.` : "";
};

export type EligibleCteFilter = { Plate?: string; DateFrom?: string; DateTo?: string };

const ymdLocal = (iso: string): string => {
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Filtro local da lista de CT-e elegíveis (a função não aceita $filter). */
export const filterEligibleCtes = <T extends { TractionPlate?: string; IssuedAt?: string }>(rows: T[], f: EligibleCteFilter): T[] => {
	const plate = (f.Plate ?? "").trim().toUpperCase();
	return (rows ?? []).filter((r) => {
		if (plate && !(r.TractionPlate ?? "").toUpperCase().includes(plate)) {
			return false;
		}
		const day = r.IssuedAt ? ymdLocal(r.IssuedAt) : "";
		if (f.DateFrom && day < f.DateFrom) {
			return false;
		}
		return !(f.DateTo && day > f.DateTo);
	});
};

export type ManifestCteRow = { LineNum: number; UnloadingCityIbge: string; UnloadingCityName: string; CteAccessKey: string };

/** CT-e agrupados por município de descarga (como no XML: infMunDescarga). */
export const groupCtesByUnloadingCity = <T extends ManifestCteRow>(rows: T[]): { CityIbge: string; CityName: string; Ctes: T[] }[] => {
	const groups: { CityIbge: string; CityName: string; Ctes: T[] }[] = [];
	for (const row of [...(rows ?? [])].sort((a, b) => a.LineNum - b.LineNum)) {
		let group = groups.find((g) => g.CityIbge === row.UnloadingCityIbge);
		if (!group) {
			group = { CityIbge: row.UnloadingCityIbge, CityName: row.UnloadingCityName, Ctes: [] };
			groups.push(group);
		}
		group.Ctes.push(row);
	}
	return groups;
};

// ---------- formulário ----------

type Num = number | string;

export type ManifestPaymentForm = {
	ContractorTaxId: string; ContractorName: string; Total: Num; IndPag: Num; Pix: string; BankCode: string; Agency: string;
	Components: { Type: string; Value: Num; Description: string }[];
	Installments: { Number: Num; DueDate: string; Value: Num }[];
};

export interface TransportManifestForm {
	Key: string;
	RouteUfs: { Uf: string }[];
	AdditionalDrivers: { Cpf: string; Name: string }[];
	TrailerPlates: { Plate: string }[];
	Seals: { Number: string }[];
	LoadingZip: string;
	UnloadingZip: string;
	Ncm: string;
	GrossWeight: Num;
	WeightUnit: string;
	CiotNumber: string;
	CiotResponsibleTaxId: string;
	Contractors: { TaxId: string; Name: string }[];
	TollSupplierCnpj: string;
	TollVoucherNumber: string;
	TollValue: Num;
	Payments: ManifestPaymentForm[];
	AdditionalInfo: string;
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v as string));
const text = (v: unknown): string => {
	const t = str(v).trim();
	return t ? t : null;
};
const digits = (v: unknown): string => str(v).replace(/\D/g, "");
const digitsOrNull = (v: unknown): string => digits(v) || null;
const blank = (v: unknown) => str(v).trim() === "";
const num = (v: unknown): number => (blank(v) ? 0 : Number(str(v).trim().replace(",", ".")));
const numOrNull = (v: unknown): number => (blank(v) ? null : num(v));

type Lined = { LineNum?: number };
const byLine = <T extends Lined>(rows: T[]): T[] => [...(rows ?? [])].sort((a, b) => (a.LineNum ?? 0) - (b.LineNum ?? 0));

/** Formulário a partir do MDF-e lido com $expand. Tração e condutor principal ficam no cabeçalho (vêm dos CT-e). */
export const transportManifestFormFrom = (m: Record<string, unknown>): TransportManifestForm => {
	const list = <T>(name: string) => (m[name] as T[]) ?? [];
	return {
		Key: str(m.Key),
		RouteUfs: byLine(list<{ LineNum: number; Uf: string }>("RouteUfs")).map((r) => ({ Uf: r.Uf })),
		AdditionalDrivers: byLine(list<{ LineNum: number; Cpf: string; Name: string; AddedByEvent?: boolean }>("Drivers"))
			.filter((d) => !d.AddedByEvent).map((d) => ({ Cpf: d.Cpf, Name: d.Name })),
		TrailerPlates: byLine(list<{ LineNum: number; Plate: string; IsTraction: boolean }>("Vehicles"))
			.filter((v) => !v.IsTraction).map((v) => ({ Plate: v.Plate })),
		Seals: list<{ Number: string }>("Seals").map((s) => ({ Number: s.Number })),
		LoadingZip: str(m.LoadingZip),
		UnloadingZip: str(m.UnloadingZip),
		Ncm: str(m.Ncm),
		GrossWeight: (m.GrossWeight as number) ?? 0,
		WeightUnit: str(m.WeightUnit) || "01",
		CiotNumber: str(m.CiotNumber),
		CiotResponsibleTaxId: str(m.CiotResponsibleTaxId),
		Contractors: list<{ TaxId: string; Name: string }>("Contractors").map((c) => ({ TaxId: c.TaxId, Name: c.Name })),
		TollSupplierCnpj: str(m.TollSupplierCnpj),
		TollVoucherNumber: str(m.TollVoucherNumber),
		TollValue: m.TollValue === null || m.TollValue === undefined ? "" : (m.TollValue as number),
		Payments: list<ManifestPaymentForm>("Payments").map((p) => ({
			ContractorTaxId: str(p.ContractorTaxId), ContractorName: str(p.ContractorName), Total: p.Total, IndPag: str(p.IndPag),
			Pix: str(p.Pix), BankCode: str(p.BankCode), Agency: str(p.Agency),
			Components: (p.Components ?? []).map((c) => ({ Type: c.Type, Value: c.Value, Description: str(c.Description) })),
			Installments: (p.Installments ?? []).map((i) => ({ Number: i.Number, DueDate: str(i.DueDate).slice(0, 10), Value: i.Value })),
		})),
		AdditionalInfo: str(m.AdditionalInfo),
	};
};

/** Corpo do TransportManifestsSave: números como JSON number, linhas vazias fora. */
export const buildTransportManifestSavePayload = (f: TransportManifestForm) => ({
	Key: f.Key,
	Model: {
		RouteUfs: (f.RouteUfs ?? []).map((r) => str(r.Uf).trim().toUpperCase()).filter((u) => u.length === 2),
		AdditionalDrivers: (f.AdditionalDrivers ?? []).filter((d) => digits(d.Cpf)).map((d) => ({ Cpf: digits(d.Cpf), Name: str(d.Name).trim() })),
		TrailerPlates: (f.TrailerPlates ?? []).map((p) => str(p.Plate).trim().toUpperCase()).filter(Boolean),
		Seals: (f.Seals ?? []).map((s) => str(s.Number).trim()).filter(Boolean),
		LoadingZip: digitsOrNull(f.LoadingZip),
		UnloadingZip: digitsOrNull(f.UnloadingZip),
		Ncm: digitsOrNull(f.Ncm),
		GrossWeight: num(f.GrossWeight),
		WeightUnit: f.WeightUnit || "01",
		CiotNumber: digitsOrNull(f.CiotNumber),
		CiotResponsibleTaxId: digitsOrNull(f.CiotResponsibleTaxId),
		Contractors: (f.Contractors ?? []).filter((c) => digits(c.TaxId)).map((c) => ({ TaxId: digits(c.TaxId), Name: str(c.Name).trim() })),
		TollSupplierCnpj: digitsOrNull(f.TollSupplierCnpj),
		TollVoucherNumber: text(f.TollVoucherNumber),
		TollValue: numOrNull(f.TollValue),
		Payments: (f.Payments ?? []).map((p) => ({
			ContractorTaxId: digits(p.ContractorTaxId),
			ContractorName: str(p.ContractorName).trim(),
			Total: num(p.Total),
			IndPag: num(p.IndPag),
			Pix: text(p.Pix),
			BankCode: text(p.BankCode),
			Agency: text(p.Agency),
			Components: (p.Components ?? []).map((c) => ({ Type: c.Type || "99", Value: num(c.Value), Description: text(c.Description) })),
			Installments: (p.Installments ?? []).map((i) => ({ Number: num(i.Number), DueDate: str(i.DueDate).slice(0, 10), Value: num(i.Value) })),
		})),
		AdditionalInfo: text(f.AdditionalInfo),
	},
});

// ---------- configuração ----------

export type MdfeSeriesRow = { Series: Num; Description: string; NextNumber: Num; IsUsed: boolean; isNew: boolean };
export type MdfeSettingsForm = {
	BranchCode: string; Enabled: boolean; Environment: string; DefaultSeries: Num; DefaultCargoType: string;
	RequiresCiot: boolean; SeriesList: MdfeSeriesRow[];
};

/** Corpo do BranchMdfeSettingsSave: ambiente pelo número do enum (1 produção, 2 homologação). */
export const buildMdfeSettingsSavePayload = (s: MdfeSettingsForm) => ({
	BranchCode: s.BranchCode,
	Enabled: s.Enabled === true,
	Environment: s.Environment === "Production" ? 1 : 2,
	DefaultSeries: Number(s.DefaultSeries),
	DefaultCargoType: s.DefaultCargoType || "02",
	RequiresCiot: s.RequiresCiot === true,
	Series: (s.SeriesList ?? []).map((r) => Number(r.Series)),
	Descriptions: (s.SeriesList ?? []).map((r) => (r.Description ?? "").trim()),
	NextNumbers: (s.SeriesList ?? []).map((r) => Number(r.NextNumber)),
});

/** $expand do MDF-e com $select explícito em cada filho. Nunca Xmls (traz o XML inteiro): o download é TransportManifestsXml. */
export const TRANSPORT_MANIFEST_EXPAND =
	"$expand=Ctes($select=LineNum,CteAccessKey,UnloadingCityIbge,UnloadingCityName,TransportDocumentKey,IsActive)," +
	"LoadingCities($select=LineNum,CityIbge,CityName),RouteUfs($select=LineNum,Uf)," +
	"Vehicles($select=LineNum,IsTraction,Plate,Renavam,TareKg,Uf),Drivers($select=LineNum,Cpf,Name,AddedByEvent)," +
	"Contractors($select=TaxId,Name),Seals($select=Number)," +
	"Payments($select=ContractorTaxId,ContractorName,Total,IndPag,Pix,BankCode,Agency;" +
	"$expand=Components($select=Type,Value,Description),Installments($select=Number,DueDate,Value))";

// ---------- entrega B: cancelamento, condutor, encerramento em lote, não encerrados ----------

export const MDFE_CANCEL_MIN = 15;
export const MDFE_CANCEL_MAX = 255;

/** Justificativa do cancelamento: 15 a 255 caracteres após o trim (mesma conta do servidor). "" = válida. */
export const cancellationJustificationError = (text: string): string => {
	const length = (text ?? "").trim().length;
	return length >= MDFE_CANCEL_MIN && length <= MDFE_CANCEL_MAX
		? ""
		: `A justificativa deve ter de ${MDFE_CANCEL_MIN} a ${MDFE_CANCEL_MAX} caracteres.`;
};

/** CPF com dígitos verificadores (aceita máscara). "" = válido. */
export const cpfError = (text: string): string => {
	const cpf = (text ?? "").replace(/\D/g, "");
	if (!cpf) {
		return "Informe o CPF do condutor.";
	}
	if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) {
		return "CPF inválido.";
	}
	const check = (len: number) => {
		let sum = 0;
		for (let i = 0; i < len; i++) {
			sum += Number(cpf[i]) * (len + 1 - i);
		}
		const rest = (sum * 10) % 11;
		return rest === 10 ? 0 : rest;
	};
	return check(9) === Number(cpf[9]) && check(10) === Number(cpf[10]) ? "" : "CPF inválido.";
};

/** Lê a propriedade em PascalCase ou camelCase (o REST do backend serializa em camelCase). */
const prop = <T>(o: Record<string, unknown>, name: string): T =>
	(o?.[name] ?? o?.[name.charAt(0).toLowerCase() + name.slice(1)]) as T;

/**
 * Retorno de evento do MDF-e (cancelamento, inclusão de condutor): 135/136 sucesso; 132/101/151 = o
 * MDF-e já estava encerrado/cancelado na SEFAZ e a situação foi atualizada (aviso); o resto é erro.
 */
export const mdfeEventOutcome = (status: Record<string, unknown>): { kind: "success" | "warning" | "error"; text: string } => {
	const code = Number(prop<number>(status, "StatusCode"));
	const text = `${prop<number>(status, "StatusCode") ?? ""} - ${prop<string>(status, "Reason") ?? ""}`;
	const kind = [135, 136].includes(code) ? "success" : [132, 101, 151].includes(code) ? "warning" : "error";
	return { kind, text };
};

export const MDFE_BATCH_MAX = 50;

export const closeBatchSelectionError = (count: number): string => {
	if (!count || count < 1) {
		return "Selecione ao menos um MDF-e.";
	}
	return count > MDFE_BATCH_MAX ? `Selecione no máximo ${MDFE_BATCH_MAX} MDF-e por vez.` : "";
};

export type NotClosedRow = {
	AccessKey: string; Protocol: string; ManifestKey: string; Number: number; Series: number; Status: string;
	TractionPlate: string; StatusDiverges: boolean; OutsideSystem: boolean;
	canClose: boolean; canConsult: boolean; state: string; situation: string;
};

/** Linha de MdfeNotClosed com as ações: divergente só consulta; fora do sistema não tem ação. */
export const notClosedRowFrom = (raw: Record<string, unknown>): NotClosedRow => {
	const status = prop<string>(raw, "Status") ?? "";
	const manifestKey = prop<string>(raw, "ManifestKey") ?? "";
	const diverges = prop<boolean>(raw, "StatusDiverges") === true;
	const outside = prop<boolean>(raw, "OutsideSystem") === true;
	const linked = !outside && !!manifestKey;
	// O lote só encerra autorizado; em processamento só consulta.
	const open = status === "Authorized" || status === "Processing";
	return {
		AccessKey: prop<string>(raw, "AccessKey") ?? "",
		Protocol: prop<string>(raw, "Protocol") ?? "",
		ManifestKey: manifestKey,
		Number: prop<number>(raw, "Number") ?? null,
		Series: prop<number>(raw, "Series") ?? null,
		Status: status,
		TractionPlate: prop<string>(raw, "TractionPlate") ?? "",
		StatusDiverges: diverges,
		OutsideSystem: outside,
		canClose: linked && status === "Authorized" && !diverges,
		canConsult: linked && (open || diverges),
		state: diverges ? "Warning" : "None",
		situation: outside
			? "MDF-e fora do sistema"
			: diverges ? `${mdfeStatusText(status)} no sistema — diverge da SEFAZ` : mdfeStatusText(status),
	};
};

export type CloseBatchItem = { key: string; number: number; success: boolean; message: string };

/** Resultado do TransportManifestsCloseBatch (camelCase; aceita PascalCase). */
export const closeBatchItemsFrom = (rows: Record<string, unknown>[]): CloseBatchItem[] =>
	(rows ?? []).map((r) => ({
		key: prop<string>(r, "Key"),
		number: prop<number>(r, "Number") ?? null,
		success: prop<boolean>(r, "Success") === true,
		message: prop<string>(r, "Message") ?? "",
	}));

/** Retorno da SEFAZ (NfeServiceStatusDto) em PascalCase ou camelCase → forma do sefazOutcome. */
export const sefazStatusFrom = (data: Record<string, unknown>): { StatusCode: number; Reason: string } => ({
	StatusCode: prop<number>(data, "StatusCode"),
	Reason: prop<string>(data, "Reason"),
});
