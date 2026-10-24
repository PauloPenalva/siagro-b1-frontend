import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
	FreightInvoiceForm, buildFreightInvoiceSavePayload, eligibleCtesUrl, emptyFreightInvoiceForm, freightInvoiceActions,
	freightInvoiceFormError, freightInvoiceFormFrom, num, selectedTotal,
} from "siagrob1/helpers/FreightInvoiceHelpers";
import { tonsText } from "siagrob1/helpers/FreightOrderHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import CommonController from "../common/CommonController";

type CteRow = {
	TransportDocumentKey: string; Number: number; Series: number; IssuedAt: string; Route: string;
	WeightKg: number; Amount: number; selected?: boolean;
};

type InvoiceItem = {
	TransportDocumentKey: string; Amount: number; IsActive: boolean;
	TransportDocument?: { Number: number; Series: number; IssuedAt: string };
};

const esc = (v: string) => encodeURIComponent(v.replace(/'/g, "''"));

/**
 * "Gerar fatura" (inclusão e edição do rascunho): filial/tomador/período listam os CT-e elegíveis
 * (FreightInvoiceEligibleCtes); a seleção soma ao vivo. Grava pela ação FreightInvoicesSave e, em
 * "Salvar e emitir", chama FreightInvoicesIssue em seguida.
 * @namespace siagrob1.controller.freightInvoices
 */
export default class Form extends CommonController {
	tonsText = tonsText;

	onInit(): void {
		this.getView().setModel(new JSONModel(emptyFreightInvoiceForm("")), "doc");
		this.getView().setModel(new JSONModel([]), "ctes");
		this.getView().setModel(new JSONModel({ total: 0, count: 0 }), "sel");
		this.getRouter().getRoute("freightInvoicesNew").attachPatternMatched(() => {
			void this.refreshStandaloneFlag();
			void this.startNew();
		});
		this.getRouter().getRoute("freightInvoicesEdit").attachPatternMatched((ev: Route$MatchedEvent) => {
			void this.refreshStandaloneFlag();
			void this.loadById((ev.getParameter("arguments") as { id: string }).id);
		});
	}

	private doc(): JSONModel {
		return this.getView().getModel("doc") as JSONModel;
	}

	private ctes(): JSONModel {
		return this.getView().getModel("ctes") as JSONModel;
	}

	private reset(): void {
		this.ctes().setData([]);
		this.recalc();
	}

	private async startNew(): Promise<void> {
		this.doc().setData(emptyFreightInvoiceForm(""));
		this.reset();
		await this.refreshPaymentConditionName(null);
		const branch = await this.getBranchInfo();
		this.doc().setProperty("/BranchCode", branch?.code ?? "");
	}

	private async loadById(id: string): Promise<void> {
		this.doc().setData(emptyFreightInvoiceForm(""));
		this.reset();
		this.setBusy(true);
		try {
			const result = await sendJson("GET", `${ServerRoutes.freightInvoices}(${encodeURIComponent(id)})`
				+ "?$expand=Items($expand=TransportDocument($select=Number,Series,IssuedAt))");
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const read = odataValue<Record<string, unknown>>(result.data);
			if (!freightInvoiceActions(read.Status as string).edit) {
				MessageBox.alert("Só a fatura em rascunho pode ser alterada.");
				this.navTo("freightInvoicesDetail", { id }, true);
				return;
			}
			const form = freightInvoiceFormFrom(read);
			this.doc().setData(form);
			// Itens atuais do rascunho (a função de elegíveis não os lista: já estão nesta fatura).
			const current = ((read.Items as InvoiceItem[]) ?? []).filter((i) => i.IsActive).map((i): CteRow => ({
				TransportDocumentKey: i.TransportDocumentKey, Number: i.TransportDocument?.Number, Series: i.TransportDocument?.Series,
				IssuedAt: i.TransportDocument?.IssuedAt, Route: "", WeightKg: null, Amount: num(i.Amount), selected: true,
			}));
			await this.refreshPaymentConditionName(form.PaymentConditionCode === "" ? null : form.PaymentConditionCode);
			await this.loadEligible(current);
		} finally {
			this.setBusy(false);
		}
	}

	private async loadEligible(keep: CteRow[] = []): Promise<void> {
		const f = this.doc().getData() as FreightInvoiceForm;
		if (!f.BranchCode || !f.TakerCardCode) {
			this.ctes().setData(keep);
			this.recalc();
			return;
		}
		const result = await sendJson("GET", eligibleCtesUrl(ServerRoutes.freightInvoiceEligibleCtes, f.BranchCode, f.TakerCardCode, f.From, f.To));
		if (!result.ok) {
			MessageBox.error(result.message);
			return;
		}
		const keepKeys = new Set(keep.map((k) => k.TransportDocumentKey));
		const rows = odataCollection<CteRow>(result.data).filter((r) => !keepKeys.has(r.TransportDocumentKey))
			.map((r) => ({ ...r, Amount: num(r.Amount), WeightKg: num(r.WeightKg), selected: false }));
		this.ctes().setData([...keep, ...rows]);
		this.recalc();
	}

	/** Total e quantidade dos CT-e marcados. */
	recalc(): void {
		const rows = this.ctes().getData() as CteRow[];
		(this.getView().getModel("sel") as JSONModel).setData({
			total: selectedTotal(rows), count: rows.filter((r) => r.selected).length,
		});
	}

	onToggleAll(_ev: unknown, value: boolean): void {
		const rows = (this.ctes().getData() as CteRow[]).map((r) => ({ ...r, selected: value }));
		this.ctes().setData(rows);
		this.recalc();
	}

	async onSearchCtes(): Promise<void> {
		const keep = (this.ctes().getData() as CteRow[]).filter((r) => r.selected && !r.Route);
		this.setBusy(true);
		try {
			await this.loadEligible(keep);
		} finally {
			this.setBusy(false);
		}
	}

	async onPickTaker(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"]);
		if (!ctx) {
			return;
		}
		const code = ctx.getProperty("CardCode") as string;
		if (code !== this.doc().getProperty("/TakerCardCode")) {
			this.reset();
		}
		this.doc().setProperty("/TakerCardCode", code);
		this.doc().setProperty("/TakerName", ctx.getProperty("CardName"));
		if (!this.doc().getProperty("/PaymentConditionCode")) {
			const r = await sendJson("GET", `/odata/BusinessPartners('${esc(code)}')?$select=CardCode,PaymentConditionCode`);
			const pc = r.ok ? odataValue<{ PaymentConditionCode?: number }>(r.data)?.PaymentConditionCode : null;
			if (pc !== null && pc !== undefined) {
				this.doc().setProperty("/PaymentConditionCode", String(pc));
				await this.refreshPaymentConditionName(pc);
			}
		}
		await this.onSearchCtes();
	}

	private async save(issue: boolean): Promise<void> {
		const form = this.doc().getData() as FreightInvoiceForm;
		const keys = (this.ctes().getData() as CteRow[]).filter((r) => r.selected).map((r) => r.TransportDocumentKey);
		const error = freightInvoiceFormError(form, keys);
		if (error) {
			MessageBox.error(error);
			return;
		}
		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.freightInvoicesSave, buildFreightInvoiceSavePayload(form, keys));
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const saved = odataValue<{ Key: string; Code: string }>(result.data);
			if (issue) {
				const issued = await sendJson("POST", ServerRoutes.freightInvoicesIssue, { Key: saved.Key });
				if (!issued.ok) {
					MessageBox.error(`Fatura ${saved.Code} gravada como rascunho, mas não foi emitida: ${issued.message}`);
					this.navTo("freightInvoicesDetail", { id: saved.Key }, true);
					return;
				}
			}
			MessageToast.show(`Fatura de frete ${saved?.Code ?? ""} ${issue ? "emitida" : "gravada"}.`, { closeOnBrowserNavigation: false });
			this.navTo("freightInvoicesDetail", { id: saved.Key }, true);
		} finally {
			this.setBusy(false);
		}
	}

	async onSave(): Promise<void> {
		await this.save(false);
	}

	async onSaveAndIssue(): Promise<void> {
		await this.save(true);
	}

	onCancel(): void {
		const key = (this.doc().getData() as FreightInvoiceForm).Key;
		if (key) {
			this.navTo("freightInvoicesDetail", { id: key });
		} else {
			this.navTo("freightInvoices");
		}
	}
}
