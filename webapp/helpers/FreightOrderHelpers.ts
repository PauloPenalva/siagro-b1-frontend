import { FreightCalculationMethod } from "siagrob1/helpers/FreightHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";

/** Ordem de frete (TMS, só STANDALONE): status como o OData serializa o enum `FreightOrderStatus`. */
export const FREIGHT_ORDER_STATUSES = [
	{ key: "Open", text: "Aberta" },
	{ key: "InExecution", text: "Em execução" },
	{ key: "Completed", text: "Concluída" },
	{ key: "Cancelled", text: "Cancelada" },
];

/** Métodos de preço da ordem: só aqui se oferece "por tonelada" (PerTon). */
export const FREIGHT_ORDER_PRICE_METHODS: { key: FreightCalculationMethod; text: string }[] = [
	{ key: "PerTon", text: "Por tonelada" },
	{ key: "PerBag", text: "Por saco (60 kg)" },
	{ key: "Fixed", text: "Fixo por viagem" },
];

export const freightOrderStatusText = (status: unknown): string =>
	FREIGHT_ORDER_STATUSES.find((s) => s.key === status)?.text ?? str(status);

export const freightOrderStatusState = (status: unknown): string => {
	switch (status) {
		case "Open": return "Information";
		case "InExecution": return "Warning";
		case "Completed": return "Success";
		case "Cancelled": return "Error";
		default: return "None";
	}
};

export const priceMethodText = (method: unknown): string =>
	FREIGHT_ORDER_PRICE_METHODS.find((m) => m.key === method)?.text ?? str(method);

/** Ações disponíveis por situação (o servidor é quem decide; isto só esconde botões). */
export const freightOrderActions = (status: string) => ({
	edit: status === "Open" || status === "InExecution",
	createCte: status === "Open" || status === "InExecution",
	close: status === "Open" || status === "InExecution",
	cancel: status === "Open" || status === "InExecution",
});

const str = (v: unknown): string =>
	v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v as string | number | boolean);

/** Edm.Decimal pode chegar como texto (IEEE754Compatible); digitado aceita vírgula. Vazio = 0. */
export const num = (v: unknown): number => {
	if (typeof v === "number") {
		return v;
	}
	const n = Number(str(v).trim().replace(",", "."));
	return Number.isFinite(n) ? n : 0;
};

/** kg → t para exibir (3 casas, pt-BR). */
export const tonsText = (kg: unknown): string =>
	kg === null || kg === undefined || kg === "" ? "" : (num(kg) / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const balanceTonsText = (contracted: unknown, transported: unknown): string =>
	tonsText(num(contracted) - num(transported));

/** Edm.Date / DateTime ("yyyy-MM-dd..."): sem new Date(), que leria como UTC e voltaria um dia. */
export const dateText = (value: unknown): string => {
	const s = str(value);
	return s ? s.slice(0, 10).split("-").reverse().join("/") : "";
};

export interface FreightOrderForm {
	Key: string;
	Code: string;
	Status: string;
	DocNumberKey: string;
	TypedCode: string;
	BranchCode: string;
	OrderDate: string;
	TakerCardCode: string; TakerName: string;
	SenderCardCode: string; SenderName: string;
	RecipientCardCode: string; RecipientName: string;
	StartMunicipalityCode: string; StartMunicipalityName: string; StartState: string;
	EndMunicipalityCode: string; EndMunicipalityName: string; EndState: string;
	ItemCode: string; ItemName: string;
	/** Volume contratado em TONELADAS na tela; grava em kg. */
	ContractedTons: number | string;
	PriceMethod: FreightCalculationMethod;
	UnitPrice: number | string;
	ValidFrom: string;
	ValidTo: string;
	PaymentConditionCode: number | string;
	UsageCode: number | string; UsageName: string;
	Observation: string;
}

export const emptyFreightOrderForm = (branchCode: string): FreightOrderForm => ({
	Key: "", Code: "", Status: "Open", DocNumberKey: "", TypedCode: "", BranchCode: branchCode ?? "",
	OrderDate: localIsoDate(new Date()),
	TakerCardCode: "", TakerName: "", SenderCardCode: "", SenderName: "", RecipientCardCode: "", RecipientName: "",
	StartMunicipalityCode: "", StartMunicipalityName: "", StartState: "",
	EndMunicipalityCode: "", EndMunicipalityName: "", EndState: "",
	ItemCode: "", ItemName: "", ContractedTons: "", PriceMethod: "PerTon", UnitPrice: "",
	ValidFrom: localIsoDate(new Date()), ValidTo: "", PaymentConditionCode: "", UsageCode: "", UsageName: "", Observation: "",
});

export const freightOrderFormFrom = (doc: Record<string, unknown>): FreightOrderForm => ({
	...emptyFreightOrderForm(str(doc.BranchCode)),
	Key: str(doc.Key),
	Code: str(doc.Code),
	Status: str(doc.Status),
	DocNumberKey: str(doc.DocNumberKey),
	OrderDate: str(doc.OrderDate).slice(0, 10),
	TakerCardCode: str(doc.TakerCardCode),
	SenderCardCode: str(doc.SenderCardCode),
	RecipientCardCode: str(doc.RecipientCardCode),
	StartMunicipalityCode: str(doc.StartMunicipalityCode),
	StartState: str(doc.StartState),
	EndMunicipalityCode: str(doc.EndMunicipalityCode),
	EndState: str(doc.EndState),
	ItemCode: str(doc.ItemCode),
	ItemName: str(doc.ItemName),
	ContractedTons: num(doc.ContractedWeightKg) / 1000,
	PriceMethod: (str(doc.PriceMethod) || "PerTon") as FreightCalculationMethod,
	UnitPrice: num(doc.UnitPrice),
	ValidFrom: str(doc.ValidFrom).slice(0, 10),
	ValidTo: str(doc.ValidTo).slice(0, 10),
	PaymentConditionCode: doc.PaymentConditionCode === null || doc.PaymentConditionCode === undefined ? "" : str(doc.PaymentConditionCode),
	UsageCode: doc.UsageCode === null || doc.UsageCode === undefined ? "" : str(doc.UsageCode),
	Observation: str(doc.Observation),
});

const text = (v: unknown): string => {
	const s = str(v).trim();
	return s ? s : null;
};

/** Data `yyyy-MM-dd` → meia-noite LOCAL em ISO (o servidor converte de volta sem virar o dia). */
const isoDate = (ymd: string): string => {
	if (!ymd) {
		return null;
	}
	const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
	return new Date(y, m - 1, d).toISOString();
};

export const freightOrderFormError = (f: FreightOrderForm, manualNumber: boolean): string => {
	if (manualNumber && !str(f.TypedCode).trim()) {
		return "Informe o número para a série Manual.";
	}
	if (!f.BranchCode) {
		return "Escolha a filial da sessão.";
	}
	if (!f.TakerCardCode) {
		return "Informe o tomador.";
	}
	if (!f.StartMunicipalityCode || !f.EndMunicipalityCode) {
		return "Informe os municípios de origem e de destino.";
	}
	if (!f.ItemCode) {
		return "Informe o produto.";
	}
	if (!(num(f.ContractedTons) > 0)) {
		return "Informe o volume contratado (t).";
	}
	if (!(num(f.UnitPrice) > 0)) {
		return "Informe o preço.";
	}
	if (!f.ValidFrom) {
		return "Informe o início da vigência.";
	}
	if (f.ValidTo && f.ValidTo < f.ValidFrom) {
		return "O fim da vigência não pode ser anterior ao início.";
	}
	return "";
};

/** Corpo da ação FreightOrdersSave: decimais como número (nunca texto), opcionais nulos. */
export const buildFreightOrderSavePayload = (f: FreightOrderForm, manualNumber: boolean) => ({
	Model: {
		Key: text(f.Key),
		DocNumberKey: text(f.DocNumberKey),
		TypedCode: manualNumber ? text(f.TypedCode) : null,
		BranchCode: str(f.BranchCode).trim(),
		OrderDate: isoDate(f.OrderDate),
		TakerCardCode: str(f.TakerCardCode).trim(),
		SenderCardCode: text(f.SenderCardCode),
		RecipientCardCode: text(f.RecipientCardCode),
		StartMunicipalityCode: str(f.StartMunicipalityCode).trim(),
		StartState: str(f.StartState).trim(),
		EndMunicipalityCode: str(f.EndMunicipalityCode).trim(),
		EndState: str(f.EndState).trim(),
		ItemCode: str(f.ItemCode).trim(),
		ItemName: str(f.ItemName).trim(),
		ContractedWeightKg: Math.round(num(f.ContractedTons) * 1000 * 1000) / 1000,
		PriceMethod: f.PriceMethod,
		UnitPrice: num(f.UnitPrice),
		ValidFrom: isoDate(f.ValidFrom),
		ValidTo: isoDate(f.ValidTo),
		PaymentConditionCode: str(f.PaymentConditionCode).trim() ? num(f.PaymentConditionCode) : null,
		UsageCode: str(f.UsageCode).trim() ? num(f.UsageCode) : null,
		Observation: text(f.Observation),
	},
});

export type FreightOrdersFilter = {
	TakerCardCode?: string; Statuses?: string[]; DateFrom?: string; DateTo?: string; ItemCode?: string;
};

const esc = (value: string) => value.replace(/'/g, "''");

/** $filter cru da lista (Status é enum; OrderDate é Edm.DateTimeOffset → literal com o fuso local). */
export const buildFreightOrdersFilter = (f: FreightOrdersFilter): string => {
	const parts: string[] = [];
	if (f.TakerCardCode?.trim()) {
		parts.push(`TakerCardCode eq '${esc(f.TakerCardCode.trim())}'`);
	}
	if (f.Statuses?.length) {
		parts.push(`(${f.Statuses.map((s) => `Status eq '${esc(s)}'`).join(" or ")})`);
	}
	if (f.DateFrom) {
		parts.push(`OrderDate ge ${dateLiteral(localDate(f.DateFrom))}`);
	}
	if (f.DateTo) {
		const next = localDate(f.DateTo);
		next.setDate(next.getDate() + 1);
		parts.push(`OrderDate lt ${dateLiteral(next)}`);
	}
	if (f.ItemCode?.trim()) {
		parts.push(`ItemCode eq '${esc(f.ItemCode.trim())}'`);
	}
	return parts.length ? parts.join(" and ") : undefined;
};

/** Filtro do value help de ordem no CT-e: mesmo tomador e ordem utilizável. */
export const usableFreightOrdersFilter = (takerCardCode: string): string =>
	`TakerCardCode eq '${esc(takerCardCode)}' and (Status eq 'Open' or Status eq 'InExecution')`;

const localDate = (ymd: string): Date => {
	const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
	return new Date(y, m - 1, d);
};

const dateLiteral = (date: Date): string => {
	const pad = (n: number) => String(n).padStart(2, "0");
	const minutes = -date.getTimezoneOffset();
	const abs = Math.abs(minutes);
	const offset = `${minutes >= 0 ? "+" : "-"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T00:00:00${offset}`;
};

/** Peso bruto do CT-e em kg pelas quantidades: "01" kg, "02" t × 1000; prefere a linha de PESO BRUTO. */
export const cteGrossWeightKg = (quantities: { UnitCode: string; MeasureType?: string; Quantity: number | string }[]): number => {
	const weights = (quantities ?? []).filter((q) => q.UnitCode === "01" || q.UnitCode === "02");
	const row = weights.find((q) => str(q.MeasureType).toUpperCase().includes("BRUTO")) ?? weights[0];
	if (!row) {
		return 0;
	}
	return num(row.Quantity) * (row.UnitCode === "02" ? 1000 : 1);
};
