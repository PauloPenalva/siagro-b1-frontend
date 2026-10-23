import { Button$PressEvent } from "sap/m/Button";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
	ManifestCteRow, ManifestPaymentForm, TRANSPORT_MANIFEST_EXPAND, TransportManifestForm, WEIGHT_UNITS, buildTransportManifestSavePayload,
	cargoTypeText, ciotError, formatAccessKey, groupCtesByUnloadingCity, mdfeActions, transportManifestFormFrom,
} from "siagrob1/helpers/MdfeHelpers";
import { STATE_CODES } from "siagrob1/helpers/StateCodes";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import BaseController from "../BaseController";

/** Linha de pagamento na tela: os filhos do servidor + o vencimento da parcela única editável. */
type PaymentRow = ManifestPaymentForm & { dueDate?: string };

const EMPTY_ROWS: Record<string, () => object> = {
	RouteUfs: () => ({ Uf: "" }),
	TrailerPlates: () => ({ Plate: "" }),
	AdditionalDrivers: () => ({ Cpf: "", Name: "" }),
	Seals: () => ({ Number: "" }),
	Contractors: () => ({ TaxId: "", Name: "" }),
	Payments: () => ({ ContractorTaxId: "", ContractorName: "", Total: 0, IndPag: "0", Pix: "", BankCode: "", Agency: "", Components: [], Installments: [] }),
};

/**
 * Edição do MDF-e em rascunho (página). O que vem dos CT-e (UFs, municípios, tração, condutor,
 * seguro, produto e valor) é só leitura; o resto grava pela ação TransportManifestsSave, que
 * devolve avisos ({ value: [...] }).
 * @namespace siagrob1.controller.transportManifests
 */
export default class Form extends BaseController {
	formatAccessKey = formatAccessKey;
	cargoTypeText = cargoTypeText;

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "doc");
		this.getView().setModel(new JSONModel({}), "head");
		this.getView().setModel(new JSONModel(WEIGHT_UNITS), "weightUnits");
		this.getView().setModel(new JSONModel(STATE_CODES), "states");
		// A inclusão parte da lista (escolha dos CT-e); a rota "new" só devolve para lá.
		this.getRouter().getRoute("transportManifestsNew").attachPatternMatched(() => {
			this.navTo("transportManifests", {}, true);
		});
		this.getRouter().getRoute("transportManifestsEdit").attachPatternMatched((ev: Route$MatchedEvent) => {
			void this.refreshStandaloneFlag();
			void this.load((ev.getParameter("arguments") as { id: string }).id);
		});
	}

	private doc(): JSONModel {
		return this.getView().getModel("doc") as JSONModel;
	}

	private head(): JSONModel {
		return this.getView().getModel("head") as JSONModel;
	}

	private async load(id: string): Promise<void> {
		this.doc().setData({});
		this.head().setData({});
		this.setBusy(true);
		try {
			const result = await sendJson("GET", `${ServerRoutes.transportManifests}(${encodeURIComponent(id)})?${TRANSPORT_MANIFEST_EXPAND}`);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const read = odataValue<Record<string, unknown>>(result.data);
			if (!mdfeActions(read.Status as string, read.Number as number).edit) {
				MessageBox.alert("Só é possível alterar MDF-e em rascunho ou rejeitado.");
				this.navTo("transportManifestsDetail", { id }, true);
				return;
			}
			const form = transportManifestFormFrom(read);
			form.Payments = form.Payments.map((p) => ({ ...p, IndPag: String(p.IndPag), dueDate: p.Installments[0]?.DueDate ?? "" }) as PaymentRow);
			this.doc().setData(form);
			const ctes = ((read.Ctes as (ManifestCteRow & { IsActive: boolean })[]) ?? []).filter((c) => c.IsActive !== false);
			const cities = ((read.LoadingCities as { LineNum: number; CityName: string }[]) ?? [])
				.sort((a, b) => a.LineNum - b.LineNum).map((c) => c.CityName).join(", ");
			this.head().setData({ ...read, cteGroups: groupCtesByUnloadingCity(ctes), loadingCitiesText: cities, requiresCiot: false });
			await this.loadRequiresCiot(read.BranchCode as string);
		} finally {
			this.setBusy(false);
		}
	}

	private async loadRequiresCiot(branchCode: string): Promise<void> {
		if (!branchCode) {
			return;
		}
		const result = await sendJson("GET", `${ServerRoutes.branchMdfeSettingsGet}(BranchCode='${encodeURIComponent(branchCode.replace(/'/g, "''"))}')`);
		this.head().setProperty("/requiresCiot", result.ok && odataValue<{ RequiresCiot?: boolean }>(result.data)?.RequiresCiot === true);
	}

	private list<T>(name: string): T[] {
		return (this.doc().getProperty(`/${name}`) as T[]) ?? [];
	}

	onAddRow(_ev: Button$PressEvent, name: string): void {
		this.doc().setProperty(`/${name}`, [...this.list(name), EMPTY_ROWS[name]()]);
	}

	onAddPayment(): void {
		this.onAddRow(null, "Payments");
	}

	onRemoveRow(ev: Button$PressEvent, name: string): void {
		const index = Number(ev.getSource().getBindingContext("doc").getPath().split("/").pop());
		this.doc().setProperty(`/${name}`, this.list(name).filter((_, i) => i !== index));
	}

	/** Pagamento da tela → componentes/parcelas do servidor: sem componente vira um "Frete" (04) com o total; a prazo leva a parcela única. */
	private paymentsForSave(): ManifestPaymentForm[] {
		return this.list<PaymentRow>("Payments").map(({ dueDate, ...p }) => {
			const total = p.Total;
			const components = p.Components?.length ? p.Components : [{ Type: "04", Value: total, Description: "" }];
			const installments = String(p.IndPag) === "1"
				? (dueDate ? [{ Number: 1, DueDate: dueDate, Value: p.Installments?.length === 1 ? p.Installments[0].Value : total }] : p.Installments ?? [])
				: [];
			return { ...p, Components: components, Installments: installments };
		});
	}

	private validationError(form: TransportManifestForm): string {
		if (!String(form.LoadingZip ?? "").replace(/\D/g, "") || !String(form.UnloadingZip ?? "").replace(/\D/g, "")) {
			return "Informe os CEPs de carregamento e de descarregamento.";
		}
		if (!(Number(String(form.GrossWeight ?? "").replace(",", ".")) > 0)) {
			return "Informe o peso bruto da carga.";
		}
		if (!form.WeightUnit) {
			return "Informe a unidade do peso.";
		}
		if (this.head().getProperty("/requiresCiot") === true && !String(form.CiotNumber ?? "").trim()) {
			return "A filial exige o CIOT no MDF-e.";
		}
		return ciotError(form.CiotNumber);
	}

	async onSave(): Promise<void> {
		const form = { ...(this.doc().getData() as TransportManifestForm), Payments: this.paymentsForSave() };
		const error = this.validationError(form);
		if (error) {
			MessageBox.error(error);
			return;
		}
		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.transportManifestsSave, buildTransportManifestSavePayload(form));
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const warnings = odataCollection<string>(result.data);
			MessageToast.show("MDF-e gravado.", { closeOnBrowserNavigation: false });
			if (warnings.length > 0) {
				MessageBox.warning(warnings.join("\n"));
			}
			this.navTo("transportManifestsDetail", { id: form.Key }, true);
		} finally {
			this.setBusy(false);
		}
	}

	onCancel(): void {
		const key = (this.doc().getData() as TransportManifestForm).Key;
		if (key) {
			this.navTo("transportManifestsDetail", { id: key });
		} else {
			this.navTo("transportManifests");
		}
	}
}
