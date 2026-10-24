import { localIsoDate } from "siagrob1/helpers/DateHelpers";

/** Fatura de frete (TMS, só STANDALONE): status como o OData serializa o enum `FreightInvoiceStatus`. */
export const FREIGHT_INVOICE_STATUSES = [
	{ key: "Draft", text: "Rascunho" },
	{ key: "Issued", text: "Emitida" },
	{ key: "Settled", text: "Liquidada" },
	{ key: "Cancelled", text: "Cancelada" },
];

const str = (v: unknown): string =>
	v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v as string | number | boolean);

/** Edm.Decimal pode chegar como texto (IEEE754Compatible); vazio = 0. */
export const num = (v: unknown): number => {
	if (typeof v === "number") {
		return v;
	}
	const n = Number(str(v).trim().replace(",", "."));
	return Number.isFinite(n) ? n : 0;
};

export const freightInvoiceStatusText = (status: unknown): string =>
	FREIGHT_INVOICE_STATUSES.find((s) => s.key === status)?.text ?? str(status);

export const freightInvoiceStatusState = (status: unknown): string => {
	switch (status) {
		case "Draft": return "Information";
		case "Issued": return "Warning";
		case "Settled": return "Success";
		case "Cancelled": return "Error";
		default: return "None";
	}
};

/** Ações por situação (o servidor é quem decide; isto só esconde botões). */
export const freightInvoiceActions = (status: string) => ({
	edit: status === "Draft",
	issue: status === "Draft",
	cancel: status === "Draft" || status === "Issued",
	print: status === "Draft" || status === "Issued" || status === "Settled",
});

/** Quantidade de CT-e ativos na fatura (Items expandido). */
export const activeItemsCount = (items: unknown): number =>
	Array.isArray(items) ? (items as { IsActive?: boolean }[]).filter((i) => i?.IsActive !== false).length : 0;

/** Soma ao vivo dos CT-e selecionados. */
export const selectedTotal = (rows: { Amount: unknown; selected?: boolean }[]): number =>
	Math.round((rows ?? []).filter((r) => r.selected).reduce((acc, r) => acc + num(r.Amount), 0) * 100) / 100;

const esc = (value: string) => value.replace(/'/g, "''");

/**
 * URL da função FreightInvoiceEligibleCtes: os quatro parâmetros vão SEMPRE (vazio = sem filtro), como texto entre aspas.
 */
export const eligibleCtesUrl = (base: string, branchCode: string, takerCardCode: string, from: string, to: string): string => {
	const p = (v: string) => `'${encodeURIComponent(esc(str(v).trim()))}'`;
	return `${base}(BranchCode=${p(branchCode)},TakerCardCode=${p(takerCardCode)},From=${p(str(from).slice(0, 10))},To=${p(str(to).slice(0, 10))})`;
};

/** Data `yyyy-MM-dd` → meia-noite LOCAL em ISO (o servidor converte de volta sem virar o dia). */
const isoDate = (ymd: string): string => {
	if (!ymd) {
		return null;
	}
	const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
	return new Date(y, m - 1, d).toISOString();
};

const text = (v: unknown): string => {
	const s = str(v).trim();
	return s ? s : null;
};

export interface FreightInvoiceForm {
	Key: string;
	Code: string;
	BranchCode: string;
	TakerCardCode: string; TakerName: string;
	From: string; To: string;
	IssueDate: string;
	DueDate: string;
	PaymentConditionCode: number | string;
	Observation: string;
}

export const emptyFreightInvoiceForm = (branchCode: string): FreightInvoiceForm => ({
	Key: "", Code: "", BranchCode: branchCode ?? "", TakerCardCode: "", TakerName: "",
	From: "", To: "", IssueDate: localIsoDate(new Date()), DueDate: "", PaymentConditionCode: "", Observation: "",
});

export const freightInvoiceFormFrom = (doc: Record<string, unknown>): FreightInvoiceForm => ({
	...emptyFreightInvoiceForm(str(doc.BranchCode)),
	Key: str(doc.Key),
	Code: str(doc.Code),
	TakerCardCode: str(doc.TakerCardCode),
	TakerName: str(doc.TakerName),
	IssueDate: str(doc.IssueDate).slice(0, 10),
	DueDate: str(doc.DueDate).slice(0, 10),
	PaymentConditionCode: doc.PaymentConditionCode === null || doc.PaymentConditionCode === undefined ? "" : str(doc.PaymentConditionCode),
	Observation: str(doc.Observation),
});

export const freightInvoiceFormError = (f: FreightInvoiceForm, keys: string[]): string => {
	if (!f.BranchCode) {
		return "Escolha a filial da sessão.";
	}
	if (!f.TakerCardCode) {
		return "Informe o tomador.";
	}
	if (!keys.length) {
		return "Selecione ao menos um CT-e.";
	}
	if (!f.IssueDate) {
		return "Informe a data de emissão.";
	}
	if (f.DueDate && f.DueDate < f.IssueDate) {
		return "O vencimento não pode ser anterior à emissão.";
	}
	return "";
};

/** Corpo da ação FreightInvoicesSave (numeração padrão da filial). */
export const buildFreightInvoiceSavePayload = (f: FreightInvoiceForm, transportDocumentKeys: string[]) => ({
	Model: {
		Key: text(f.Key),
		BranchCode: str(f.BranchCode).trim(),
		TakerCardCode: str(f.TakerCardCode).trim(),
		IssueDate: isoDate(f.IssueDate),
		DueDate: isoDate(f.DueDate),
		PaymentConditionCode: str(f.PaymentConditionCode).trim() ? num(f.PaymentConditionCode) : null,
		Observation: text(f.Observation),
		TransportDocumentKeys: [...transportDocumentKeys],
		DocNumberKey: null as string,
		TypedCode: null as string,
	},
});

/** Corpo da ação FreightInvoicesBatchCreate: tomador vazio = todos. */
export const buildFreightInvoiceBatchPayload = (b: { BranchCode: string; From: string; To: string; TakerCardCode?: string; Issue?: boolean }) => ({
	BranchCode: str(b.BranchCode).trim(),
	From: str(b.From).slice(0, 10),
	To: str(b.To).slice(0, 10),
	TakerCardCode: text(b.TakerCardCode),
	Issue: b.Issue === true,
});

export type FreightInvoicesFilter = { TakerCardCode?: string; Statuses?: string[]; DateFrom?: string; DateTo?: string };

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

/** $filter cru da lista (Status é enum; IssueDate DateTimeOffset → literal com fuso local; "até" inclui o dia). */
export const buildFreightInvoicesFilter = (f: FreightInvoicesFilter): string => {
	const parts: string[] = [];
	if (f.TakerCardCode?.trim()) {
		parts.push(`TakerCardCode eq '${esc(f.TakerCardCode.trim())}'`);
	}
	if (f.Statuses?.length) {
		parts.push(`(${f.Statuses.map((s) => `Status eq '${esc(s)}'`).join(" or ")})`);
	}
	if (f.DateFrom) {
		parts.push(`IssueDate ge ${dateLiteral(localDate(f.DateFrom))}`);
	}
	if (f.DateTo) {
		const next = localDate(f.DateTo);
		next.setDate(next.getDate() + 1);
		parts.push(`IssueDate lt ${dateLiteral(next)}`);
	}
	return parts.length ? parts.join(" and ") : undefined;
};

/** Fatura não cancelada com item ativo do CT-e (mostrado no detalhe do CT-e). */
export const invoiceOfCteFilter = (transportDocumentKey: string): string =>
	`Items/any(i: i/TransportDocumentKey eq ${transportDocumentKey} and i/IsActive) and Status ne 'Cancelled'`;

/** Percurso "Origem/UF → Destino/UF" como o DTO dos elegíveis (nome do município quando conhecido). */
export const cteRouteText = (names: Record<string, string>, startCode: string, startState: string, endCode: string, endState: string): string => {
	const place = (code: string, state: string) => {
		const name = (code && names?.[code]) || code || "";
		return state ? `${name}/${state}` : name;
	};
	return `${place(startCode, startState)} → ${place(endCode, endState)}`;
};

/**
 * Vencimento exibido no detalhe: pelos títulos gerados (1 parcela = a data; várias = "1ª dd/MM/yyyy … (N parcelas)"),
 * senão o DueDate da fatura, senão o nome da condição de pagamento (rascunho).
 */
export const dueDateText = (titleDueDates: string[], dueDate: string, conditionName: string): string => {
	const fmt = (v: string) => str(v).slice(0, 10).split("-").reverse().join("/");
	const dates = (titleDueDates ?? []).filter((d) => !!d).map((d) => str(d).slice(0, 10)).sort();
	if (dates.length === 1) {
		return fmt(dates[0]);
	}
	if (dates.length > 1) {
		return `1ª ${fmt(dates[0])} … ${fmt(dates[dates.length - 1])} (${dates.length} parcelas)`;
	}
	if (dueDate) {
		return fmt(dueDate);
	}
	return conditionName ? `Pela condição: ${conditionName}` : "";
};
