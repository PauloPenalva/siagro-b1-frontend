import Dialog from "sap/m/Dialog";
import { Link$PressEvent } from "sap/m/Link";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import { openAttachmentViewer } from "siagrob1/dialogs/AttachmentViewer";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { sefazOutcome } from "siagrob1/helpers/CteHelpers";
import {
	ManifestCteRow, TRANSPORT_MANIFEST_EXPAND, cargoTypeText, formatAccessKey, mdfeActions, mdfeStatusState, mdfeStatusText, weightUnitText,
} from "siagrob1/helpers/MdfeHelpers";
import { STATE_CODES } from "siagrob1/helpers/StateCodes";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import BaseController from "../BaseController";

const CLOSE_FRAGMENT = "siagrob1.view.transportManifests.fragments.CloseDialog";
const EVENTS_EXPAND = ",Events($select=Type,Sequence,ProtocolNumber,RegisteredAt,StatusCode,StatusReason)";

type DetailDoc = Record<string, unknown> & {
	Key: string; Status: string; Number: number; Series: number; AccessKey: string; UfEnd: string;
	Ctes: (ManifestCteRow & { TransportDocumentKey: string })[];
};

const byLine = <T extends { LineNum?: number }>(rows: T[]) => [...(rows ?? [])].sort((a, b) => (a.LineNum ?? 0) - (b.LineNum ?? 0));

/**
 * Detalhe do MDF-e (ObjectPage). Lê por fetch num JSONModel e mostra os botões conforme a situação
 * (mdfeActions). Falha de comunicação com a SEFAZ chega como 400 "Sem resposta da SEFAZ: ...".
 * @namespace siagrob1.controller.transportManifests
 */
export default class Detail extends BaseController {
	mdfeStatusText = mdfeStatusText;
	mdfeStatusState = mdfeStatusState;
	formatAccessKey = formatAccessKey;
	cargoTypeText = cargoTypeText;
	weightUnitText = weightUnitText;
	/** ClosedOn é Edm.Date ("yyyy-MM-dd"): new Date() leria como UTC e mostraria o dia anterior. */
	closedOnText = (value: string) => (value ? value.slice(0, 10).split("-").reverse().join("/") : "");

	private key: string;
	private closeDialog: Dialog;

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "doc");
		this.getView().setModel(new JSONModel(mdfeActions("", null)), "act");
		this.getView().setModel(new JSONModel({}), "close");
		this.getView().setModel(new JSONModel(STATE_CODES), "states");
		this.getRouter().getRoute("transportManifestsDetail").attachPatternMatched((ev: Route$MatchedEvent) => {
			void this.refreshStandaloneFlag();
			this.key = (ev.getParameter("arguments") as { id: string }).id;
			void this.reload();
		});
	}

	private doc(): DetailDoc {
		return (this.getView().getModel("doc") as JSONModel).getData() as DetailDoc;
	}

	private async reload(): Promise<void> {
		(this.getView().getModel("doc") as JSONModel).setData({});
		(this.getView().getModel("act") as JSONModel).setData(mdfeActions("", null));
		this.setBusy(true);
		try {
			const result = await sendJson("GET",
				`${ServerRoutes.transportManifests}(${encodeURIComponent(this.key)})?${TRANSPORT_MANIFEST_EXPAND}${EVENTS_EXPAND}`);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const doc = odataValue<DetailDoc>(result.data);
			const list = <T>(name: string) => (doc[name] as T[]) ?? [];
			(this.getView().getModel("doc") as JSONModel).setData({
				...doc,
				Ctes: byLine(doc.Ctes).filter((c) => (c as { IsActive?: boolean }).IsActive !== false),
				routeText: byLine(list<{ LineNum: number; Uf: string }>("RouteUfs")).map((r) => r.Uf).join(", "),
				loadingCitiesText: byLine(list<{ LineNum: number; CityName: string }>("LoadingCities")).map((c) => c.CityName).join(", "),
				vehiclesText: byLine(list<{ LineNum: number; Plate: string; IsTraction: boolean }>("Vehicles"))
					.map((v) => (v.IsTraction ? `${v.Plate} (tração)` : v.Plate)).join(", "),
				driversText: [`${str(doc.DriverCpf)} ${str(doc.DriverName)}`.trim(),
					...byLine(list<{ LineNum: number; Cpf: string; Name: string }>("Drivers")).map((d) => `${d.Cpf} ${d.Name}`)]
					.filter(Boolean).join(", "),
				sealsText: list<{ Number: string }>("Seals").map((s) => s.Number).join(", "),
			});
			(this.getView().getModel("act") as JSONModel).setData(mdfeActions(doc.Status, doc.Number));
		} finally {
			this.setBusy(false);
		}
	}

	/** Ação simples (Key + extras) com mensagem de sucesso. */
	private async run(url: string, success: string): Promise<void> {
		this.setBusy(true);
		try {
			const result = await sendJson("POST", url, { Key: this.key });
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			MessageToast.show(success);
		} finally {
			this.setBusy(false);
		}
		await this.reload();
	}

	/** Ação que vai à SEFAZ: mostra cStat - motivo. */
	private async runSefaz(url: string, body: object = {}): Promise<void> {
		this.setBusy(true);
		try {
			const result = await sendJson("POST", url, { Key: this.key, ...body });
			if (!result.ok) {
				MessageBox.error(result.message);
			} else {
				const outcome = sefazOutcome(odataValue<{ StatusCode: number; Reason: string }>(result.data));
				if (outcome.ok) {
					MessageBox.success(outcome.text);
				} else {
					MessageBox.warning(outcome.text);
				}
			}
		} finally {
			this.setBusy(false);
		}
		await this.reload();
	}

	onBack(): void {
		this.navTo("transportManifests");
	}

	onEdit(): void {
		this.navTo("transportManifestsEdit", { id: this.key });
	}

	onOpenCte(ev: Link$PressEvent): void {
		const key = ev.getSource().getBindingContext("doc").getProperty("TransportDocumentKey") as string;
		if (key) {
			this.navTo("transportDocumentsDetail", { id: key });
		}
	}

	async onConfirm(): Promise<void> {
		if (await confirmDialog("Confirmar o MDF-e? O número e a chave são gerados agora e não mudam mais.", "Confirmar MDF-e?")) {
			await this.run(ServerRoutes.transportManifestsConfirm, "MDF-e confirmado.");
		}
	}

	async onReopen(): Promise<void> {
		await this.run(ServerRoutes.transportManifestsReopen, "MDF-e reaberto.");
	}

	async onTransmit(): Promise<void> {
		await this.runSefaz(ServerRoutes.transportManifestsTransmit);
	}

	async onConsult(): Promise<void> {
		await this.runSefaz(ServerRoutes.transportManifestsConsult);
	}

	async onDiscardNumber(): Promise<void> {
		if (await confirmDialog("O número volta para a fila de inutilização da filial e o MDF-e fica em rascunho, sem número nem chave.",
			"Descartar número do MDF-e?")) {
			await this.run(ServerRoutes.transportManifestsDiscardNumber, "Número descartado.");
		}
	}

	async onDelete(): Promise<void> {
		if (!(await confirmDialog("Deseja realmente excluir este MDF-e? Os CT-e voltam a ficar disponíveis.", "Excluir MDF-e?"))) {
			return;
		}
		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.transportManifestsDelete, { Key: this.key });
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			MessageToast.show("MDF-e excluído.", { closeOnBrowserNavigation: false });
			this.navTo("transportManifests", {}, true);
		} finally {
			this.setBusy(false);
		}
	}

	async onDamdfe(): Promise<void> {
		const doc = this.doc();
		await openAttachmentViewer({
			url: `${ServerRoutes.damdfeReport}/${this.key}`,
			method: "GET",
			errorMessage: "Falha ao gerar o DAMDFE.",
			title: `DAMDFE – MDF-e nº ${doc.Number} série ${doc.Series}`,
			fileName: `${doc.AccessKey}-damdfe.pdf`,
		});
	}

	/** Encerramento: data de hoje (local), UF de fim e o município de descarga do último CT-e. */
	async onClose(): Promise<void> {
		const doc = this.doc();
		const last = doc.Ctes?.length ? doc.Ctes[doc.Ctes.length - 1] : null;
		(this.getView().getModel("close") as JSONModel).setData({
			ClosedOn: localIsoDate(new Date()),
			UfCode: doc.UfEnd ?? "",
			CityIbge: last?.UnloadingCityIbge ?? "",
			CityName: last?.UnloadingCityName ?? "",
		});
		this.closeDialog ??= await DialogHelper.createDialog(this, CLOSE_FRAGMENT);
		this.closeDialog.open();
	}

	onCancelClose(): void {
		this.closeDialog?.close();
	}

	async onConfirmClose(): Promise<void> {
		const data = (this.getView().getModel("close") as JSONModel).getData() as { ClosedOn: string; UfCode: string; CityIbge: string };
		if (!data.ClosedOn || !data.UfCode || !/^\d{7}$/.test((data.CityIbge ?? "").trim())) {
			MessageBox.error("Informe a data, a UF e o código IBGE do município (7 dígitos).");
			return;
		}
		this.closeDialog.close();
		await this.runSefaz(ServerRoutes.transportManifestsClose, {
			ClosedOn: data.ClosedOn, UfCode: data.UfCode, CityIbge: data.CityIbge.trim(),
		});
	}
}

function str(v: unknown): string {
	return v === null || v === undefined ? "" : String(v as string);
}
