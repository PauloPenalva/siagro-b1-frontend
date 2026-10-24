import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Select$ChangeEvent } from "sap/m/Select";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
	FREIGHT_ORDER_PRICE_METHODS, FreightOrderForm, buildFreightOrderSavePayload, emptyFreightOrderForm, freightOrderActions,
	freightOrderFormError, freightOrderFormFrom, num,
} from "siagrob1/helpers/FreightOrderHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import CommonController from "../common/CommonController";

type Series = { Key: string; Name: string; IsManual?: boolean };
type PartyRole = "Taker" | "Sender" | "Recipient";

const esc = (v: string) => encodeURIComponent(v.replace(/'/g, "''"));

/**
 * Inclusão e edição da ordem de frete (página, JSON model). Volume em toneladas na tela e kg no
 * servidor; grava pela ação FreightOrdersSave (devolve a ordem).
 * @namespace siagrob1.controller.freightOrders
 */
export default class Form extends CommonController {
	onInit(): void {
		this.getView().setModel(new JSONModel(emptyFreightOrderForm("")), "doc");
		this.getView().setModel(new JSONModel({ manual: false, locked: false }), "form");
		this.getView().setModel(new JSONModel([]), "series");
		this.getView().setModel(new JSONModel(FREIGHT_ORDER_PRICE_METHODS), "priceMethods");
		this.getRouter().getRoute("freightOrdersNew").attachPatternMatched(() => {
			void this.refreshStandaloneFlag();
			void this.startNew();
		});
		this.getRouter().getRoute("freightOrdersEdit").attachPatternMatched((ev: Route$MatchedEvent) => {
			void this.refreshStandaloneFlag();
			void this.loadById((ev.getParameter("arguments") as { id: string }).id);
		});
	}

	private doc(): JSONModel {
		return this.getView().getModel("doc") as JSONModel;
	}

	private form(): JSONModel {
		return this.getView().getModel("form") as JSONModel;
	}

	private async loadSeries(): Promise<Series[]> {
		const result = await sendJson("GET",
			"/odata/DocNumbers?$filter=TransactionCode eq 'FreightOrder' and Inactive eq false&$orderby=IsManual,Name&$select=Key,Name,IsManual");
		const list = result.ok ? odataCollection<Series>(result.data) : [];
		(this.getView().getModel("series") as JSONModel).setData(list);
		return list;
	}

	private async startNew(): Promise<void> {
		this.form().setData({ manual: false, locked: false });
		this.doc().setData(emptyFreightOrderForm(""));
		await this.refreshPaymentConditionName(null);
		this.setBusy(true);
		try {
			const branch = await this.getBranchInfo();
			const list = await this.loadSeries();
			const info = await this.getDocNumberInfoByTransaction("FreightOrder");
			const def = (info ?? []).find((x) => x.Default) ?? list[0];
			this.doc().setProperty("/BranchCode", branch?.code ?? "");
			this.doc().setProperty("/DocNumberKey", def?.Key ?? "");
			this.form().setProperty("/manual", list.find((s) => s.Key === def?.Key)?.IsManual === true);
		} finally {
			this.setBusy(false);
		}
	}

	private async loadById(id: string): Promise<void> {
		this.form().setData({ manual: false, locked: false });
		this.doc().setData(emptyFreightOrderForm(""));
		this.setBusy(true);
		try {
			await this.loadSeries();
			const result = await sendJson("GET", `${ServerRoutes.freightOrders}(${encodeURIComponent(id)})`);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const read = odataValue<Record<string, unknown>>(result.data);
			if (!freightOrderActions(read.Status as string).edit) {
				MessageBox.alert("Ordem encerrada ou cancelada não pode ser alterada.");
				this.navTo("freightOrdersDetail", { id }, true);
				return;
			}
			const form = freightOrderFormFrom(read);
			this.doc().setData(form);
			this.form().setProperty("/locked", num(read.TransportedWeightKg) > 0);
			await Promise.all([
				this.loadNames(form),
				this.refreshPaymentConditionName(form.PaymentConditionCode === "" ? null : form.PaymentConditionCode),
			]);
		} finally {
			this.setBusy(false);
		}
	}

	/** Descrições ao lado dos códigos (parceiros, municípios, natureza). */
	private async loadNames(form: FreightOrderForm): Promise<void> {
		const partner = async (code: string, path: string) => {
			if (!code) return;
			const r = await sendJson("GET", `/odata/BusinessPartners('${esc(code)}')?$select=CardCode,CardName`);
			if (r.ok) this.doc().setProperty(path, odataValue<{ CardName: string }>(r.data)?.CardName ?? "");
		};
		const city = async (code: string, path: string) => {
			if (!code) return;
			const r = await sendJson("GET", `/odata/Municipalities?$filter=Code eq '${esc(code)}'&$select=Code,Name`);
			if (r.ok) this.doc().setProperty(path, odataCollection<{ Name: string }>(r.data)[0]?.Name ?? "");
		};
		const usage = async () => {
			if (form.UsageCode === "") return;
			const r = await sendJson("GET", `${ServerRoutes.usages}(${Number(form.UsageCode)})?$select=Name`);
			if (r.ok) this.doc().setProperty("/UsageName", odataValue<{ Name: string }>(r.data)?.Name ?? "");
		};
		await Promise.all([
			partner(form.TakerCardCode, "/TakerName"), partner(form.SenderCardCode, "/SenderName"), partner(form.RecipientCardCode, "/RecipientName"),
			city(form.StartMunicipalityCode, "/StartMunicipalityName"), city(form.EndMunicipalityCode, "/EndMunicipalityName"), usage(),
		]);
	}

	onSeriesChange(ev: Select$ChangeEvent): void {
		const key = ev.getParameter("selectedItem")?.getKey();
		const list = (this.getView().getModel("series") as JSONModel).getData() as Series[];
		const manual = list.find((s) => s.Key === key)?.IsManual === true;
		this.form().setProperty("/manual", manual);
		if (!manual) {
			this.doc().setProperty("/TypedCode", "");
		}
	}

	async onPickParty(_ev: Input$ValueHelpRequestEvent, role: PartyRole): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"]);
		if (!ctx) {
			return;
		}
		this.doc().setProperty(`/${role}CardCode`, ctx.getProperty("CardCode"));
		this.doc().setProperty(`/${role}Name`, ctx.getProperty("CardName"));
		if (role === "Taker" && !this.doc().getProperty("/PaymentConditionCode")) {
			await this.suggestPaymentCondition(ctx.getProperty("CardCode") as string);
		}
	}

	/** Condição sugerida do cadastro do tomador (continua editável). */
	private async suggestPaymentCondition(cardCode: string): Promise<void> {
		const r = await sendJson("GET", `/odata/BusinessPartners('${esc(cardCode)}')?$select=CardCode,PaymentConditionCode`);
		const code = r.ok ? odataValue<{ PaymentConditionCode?: number }>(r.data)?.PaymentConditionCode : null;
		if (code !== null && code !== undefined) {
			this.doc().setProperty("/PaymentConditionCode", String(code));
			await this.refreshPaymentConditionName(code);
		}
	}

	onClearParty(_ev: unknown, role: PartyRole): void {
		this.doc().setProperty(`/${role}CardCode`, "");
		this.doc().setProperty(`/${role}Name`, "");
	}

	async onPickMunicipality(_ev: Input$ValueHelpRequestEvent, side: "Start" | "End"): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "MunicipalitiesSelectDialog", ["Code", "Name", "StateAbbreviation"]);
		if (ctx) {
			this.doc().setProperty(`/${side}MunicipalityCode`, String(ctx.getProperty("Code")));
			this.doc().setProperty(`/${side}MunicipalityName`, ctx.getProperty("Name"));
			this.doc().setProperty(`/${side}State`, ctx.getProperty("StateAbbreviation"));
		}
	}

	async onPickItem(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "ItemsSelectDialog", ["ItemCode", "ItemName"]);
		if (ctx) {
			this.doc().setProperty("/ItemCode", ctx.getProperty("ItemCode"));
			this.doc().setProperty("/ItemName", ctx.getProperty("ItemName"));
		}
	}

	async onPickUsage(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "UsagesSelectDialog", ["Name", "Description"],
			[new Filter("Inactive", FilterOperator.EQ, false)], undefined, "Direction eq 'Outgoing'");
		if (ctx) {
			this.doc().setProperty("/UsageCode", String(ctx.getProperty("Code")));
			this.doc().setProperty("/UsageName", ctx.getProperty("Name"));
		}
	}

	async onSave(): Promise<void> {
		const form = this.doc().getData() as FreightOrderForm;
		const manual = !form.Key && this.form().getProperty("/manual") === true;
		const error = freightOrderFormError(form, manual);
		if (error) {
			MessageBox.error(error);
			return;
		}
		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.freightOrdersSave, buildFreightOrderSavePayload(form, manual));
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const saved = odataValue<{ Key: string; Code: string }>(result.data);
			MessageToast.show(`Ordem de frete ${saved?.Code ?? ""} gravada.`, { closeOnBrowserNavigation: false });
			this.navTo("freightOrdersDetail", { id: saved.Key }, true);
		} finally {
			this.setBusy(false);
		}
	}

	onCancel(): void {
		const key = (this.doc().getData() as FreightOrderForm).Key;
		if (key) {
			this.navTo("freightOrdersDetail", { id: key });
		} else {
			this.navTo("freightOrders");
		}
	}
}
