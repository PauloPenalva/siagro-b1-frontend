import { Button$PressEvent } from "sap/m/Button";
import { Input$LiveChangeEvent, Input$ValueHelpRequestEvent } from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import FileUploader, { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
	CtePartyRoleName, PARTY_ROLES, QUANTITY_UNITS, TAKER_ROLES, TransportDocumentForm, TransportDocumentRead,
	TRANSPORT_DOCUMENT_EXPAND, buildTransportDocumentSavePayload, emptyTransportDocumentForm, paymentConditionAfterPartyPick, transportDocumentFormFrom,
} from "siagrob1/helpers/CteHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import CommonController from "../common/CommonController";

type CteSettings = { DefaultSeries: number; DefaultQuantityUnit: string; SeriesList: { Series: number; Description: string }[] };


/**
 * Inclusão e edição do CT-e (página). Grava pela ação TransportDocumentsSave, que substitui os
 * filhos de uma vez e recalcula os tributos pela natureza; avisos voltam em `Warnings`.
 * @namespace siagrob1.controller.transportDocuments
 */
export default class Form extends CommonController {
	private defaultUnit = "00";

	onInit(): void {
		this.getView().setModel(new JSONModel(emptyTransportDocumentForm("", 1)), "doc");
		this.getView().setModel(new JSONModel([]), "series");
		this.getView().setModel(new JSONModel(TAKER_ROLES), "takers");
		this.getView().setModel(new JSONModel(QUANTITY_UNITS), "units");
		this.getRouter().getRoute("transportDocumentsNew").attachPatternMatched(() => {
			void this.refreshStandaloneFlag();
			void this.startNew();
		});
		this.getRouter().getRoute("transportDocumentsEdit").attachPatternMatched((ev) => {
			void this.refreshStandaloneFlag();
			void this.load(ev);
		});
	}

	private doc(): JSONModel {
		return this.getView().getModel("doc") as JSONModel;
	}

	private async startNew(): Promise<void> {
		const branch = await this.getBranchInfo();
		const code = branch?.code ?? "";
		this.doc().setData(emptyTransportDocumentForm(code, 1));
		await this.refreshPaymentConditionName(null);
		if (code) {
			await this.loadSettings(code, true);
		}
	}

	/** Séries e unidade padrão da filial; `applyDefaults` põe a série padrão no documento novo. */
	private async loadSettings(branchCode: string, applyDefaults: boolean): Promise<void> {
		const result = await sendJson("GET", `${ServerRoutes.branchCteSettingsGet}(BranchCode='${encodeURIComponent(branchCode)}')`);
		if (!result.ok) {
			(this.getView().getModel("series") as JSONModel).setData([]);
			MessageBox.error(result.message);
			return;
		}
		const settings = odataValue<CteSettings>(result.data);
		(this.getView().getModel("series") as JSONModel).setData(settings.SeriesList ?? []);
		this.defaultUnit = settings.DefaultQuantityUnit || "00";
		if (applyDefaults) {
			this.doc().setProperty("/Series", String(settings.DefaultSeries));
		}
	}

	private async load(ev: Route$MatchedEvent): Promise<void> {
		const { id } = ev.getParameter("arguments") as { id: string };
		await this.loadById(id);
	}

	private async loadById(id: string): Promise<void> {
		this.doc().setData(emptyTransportDocumentForm("", 1));
		this.setBusy(true);
		try {
			const result = await sendJson("GET", `${ServerRoutes.transportDocuments}(${encodeURIComponent(id)})?${TRANSPORT_DOCUMENT_EXPAND}`);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const read = odataValue<TransportDocumentRead>(result.data);
			const form = transportDocumentFormFrom(read);
			form.Series = String(form.Series);
			this.doc().setData({ ...form, StatusReason: read.StatusReason ?? "", UsageName: "" });
			await this.loadSettings(form.BranchCode, false);
			await this.loadUsageName(form.UsageCode);
			await this.refreshPaymentConditionName(form.PaymentConditionCode);
		} finally {
			this.setBusy(false);
		}
	}

	private async loadUsageName(code: number | string): Promise<void> {
		if (code === null || code === undefined || code === "") {
			return;
		}
		const result = await sendJson("GET", `/odata/Usages(${Number(code)})?$select=Name`);
		if (result.ok) {
			this.doc().setProperty("/UsageName", odataValue<{ Name: string }>(result.data)?.Name ?? "");
		}
	}

	async onPickBranch(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "BranchsSelectDialog", ["Code", "BranchName", "ShortName", "TaxId"]);
		if (!ctx) {
			return;
		}
		const code = ctx.getProperty("Code") as string;
		this.doc().setProperty("/BranchCode", code);
		await this.loadSettings(code, true);
	}

	async onPickUsage(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "UsagesSelectDialog", ["Name", "Description"],
			[new Filter("Inactive", FilterOperator.EQ, false)], undefined, "Direction eq 'Outgoing'");
		if (ctx) {
			this.doc().setProperty("/UsageCode", ctx.getProperty("Code"));
			this.doc().setProperty("/UsageName", ctx.getProperty("Name"));
		}
	}

	async onPickParty(_ev: Input$ValueHelpRequestEvent, role: CtePartyRoleName): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"]);
		if (ctx) {
			this.doc().setProperty(`/${role}`, { CardCode: ctx.getProperty("CardCode") as string, CardName: ctx.getProperty("CardName") as string });
			await this.suggestPaymentCondition(role);
		}
	}

	async onTakerChanged(): Promise<void> {
		await this.suggestPaymentCondition(null);
	}

	/** Ícone de limpar / texto apagado: some também a descrição. */
	onPaymentConditionLiveChange(ev: Input$LiveChangeEvent): void {
		if (!ev.getParameter("value")) {
			this.doc().setProperty("/PaymentConditionCode", "");
			void this.refreshPaymentConditionName(null);
		}
	}

	/**
	 * Condição sugerida do cadastro do tomador (continua editável). `pickedRole` null = o tomador
	 * mudou; outro papel que não o tomador não mexe na condição.
	 */
	private async suggestPaymentCondition(pickedRole: CtePartyRoleName): Promise<void> {
		const form = this.doc().getData() as TransportDocumentForm;
		const takerRole = PARTY_ROLES[Number(form.TakerRole)];
		if (pickedRole !== null && pickedRole !== takerRole) {
			return;
		}
		const cardCode = takerRole ? form[takerRole]?.CardCode : "";
		let partnerCode: number = null;
		if (cardCode) {
			const result = await sendJson("GET",
				`/odata/BusinessPartners('${encodeURIComponent(cardCode.replace(/'/g, "''"))}')?$select=CardCode,PaymentConditionCode`);
			partnerCode = result.ok ? odataValue<{ PaymentConditionCode?: number }>(result.data)?.PaymentConditionCode ?? null : null;
		}
		const next = paymentConditionAfterPartyPick(form.TakerRole, pickedRole, form.PaymentConditionCode, partnerCode);
		if (next.changed) {
			this.doc().setProperty("/PaymentConditionCode", next.code ?? "");
			await this.refreshPaymentConditionName(next.code);
		}
	}

	onClearParty(_ev: Button$PressEvent, role: CtePartyRoleName): void {
		this.doc().setProperty(`/${role}`, { CardCode: "", CardName: "" });
	}

	async onPickCombination(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "TruckCombinationsSelectDialog", ["Code", "Description", "TractionTruckCode"]);
		if (ctx) {
			this.doc().setProperty("/TruckCombinationCode", ctx.getProperty("Code"));
		}
	}

	private list<T>(name: string): T[] {
		return (this.doc().getProperty(`/${name}`) as T[]) ?? [];
	}

	onAddNfeKey(): void {
		this.doc().setProperty("/NfeKeys", [...this.list("NfeKeys"), { AccessKey: "" }]);
	}

	onAddQuantity(): void {
		this.doc().setProperty("/Quantities", [...this.list("Quantities"), { UnitCode: this.defaultUnit, MeasureType: "", Quantity: 0 }]);
	}

	onAddComponent(): void {
		this.doc().setProperty("/Components", [...this.list("Components"), { Name: "", Value: 0 }]);
	}

	onRemoveRow(ev: Button$PressEvent, name: string): void {
		const index = Number(ev.getSource().getBindingContext("doc").getPath().split("/").pop());
		this.doc().setProperty(`/${name}`, this.list(name).filter((_, i) => i !== index));
	}

	/**
	 * Importa um ou mais XML de NF-e: o servidor cria (ou complementa) o rascunho com remetente,
	 * destinatário, chaves, valor e produto. O que não foi gravado no formulário é descartado.
	 */
	async onImportNfeXml(ev: FileUploader$ChangeEvent): Promise<void> {
		const files = Array.from((ev.getParameter("files") as unknown as FileList) ?? []);
		(this.byId("cteNfeXmlUploader") as FileUploader)?.clear();
		if (files.length === 0) {
			return;
		}
		const data = this.doc().getData() as TransportDocumentForm;
		if (!data.BranchCode) {
			MessageBox.warning("Escolha a filial antes de importar.");
			return;
		}

		this.setBusy(true);
		try {
			const xmls = await Promise.all(files.map((f) => readFileAsText(f)));
			const result = await sendJson("POST", ServerRoutes.transportDocumentsImportNfe, {
				Key: data.Key || null, BranchCode: data.BranchCode, Xmls: xmls,
			});
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const key = odataValue<string>(result.data);
			MessageToast.show(`${files.length} NF-e importada(s).`, { closeOnBrowserNavigation: false });
			if (key === data.Key) {
				await this.loadById(key);
			} else {
				this.navTo("transportDocumentsEdit", { id: key }, true);
			}
		} finally {
			this.setBusy(false);
		}
	}

	async onSave(): Promise<void> {
		const payload = buildTransportDocumentSavePayload(this.doc().getData() as TransportDocumentForm);
		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.transportDocumentsSave, payload);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const saved = odataValue<{ Key: string; Warnings?: string[] }>(result.data);
			const warnings = odataCollection<string>(saved?.Warnings ?? []);
			MessageToast.show("CT-e gravado.", { closeOnBrowserNavigation: false });
			if (warnings.length > 0) {
				MessageBox.warning(warnings.join("\n"));
			}
			this.navTo("transportDocumentsDetail", { id: saved.Key }, true);
		} finally {
			this.setBusy(false);
		}
	}

	onCancel(): void {
		const key = (this.doc().getData() as TransportDocumentForm).Key;
		if (key) {
			this.navTo("transportDocumentsDetail", { id: key });
		} else {
			this.navTo("transportDocuments");
		}
	}
}

function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo."));
		reader.readAsText(file);
	});
}
