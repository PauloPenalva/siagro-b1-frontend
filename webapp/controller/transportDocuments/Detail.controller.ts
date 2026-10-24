import { Link$PressEvent } from "sap/m/Link";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import { openAttachmentViewer } from "siagrob1/dialogs/AttachmentViewer";
import { openCteCorrectionDialog } from "siagrob1/dialogs/CteCorrectionDialog";
import { openNfeCancelDialog } from "siagrob1/dialogs/NfeCancelDialog";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import NfeEmailHelper from "siagrob1/controller/common/NfeEmailHelper";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
	buildCorrectionPayload, canEndorse, cancellationJustificationError, endorsementStatusState, endorsementStatusText, cteActions, cteStatusState, cteStatusText,
	TRANSPORT_DOCUMENT_EXPAND, formatAccessKey, partyRoleText, quantityUnitText, sefazOutcome, takerRoleText,
} from "siagrob1/helpers/CteHelpers";
import { CteManifestLink, manifestLinkText } from "siagrob1/helpers/MdfeHelpers";
import { invoiceOfCteFilter } from "siagrob1/helpers/FreightInvoiceHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import BaseController from "../BaseController";

type DetailDoc = {
	Key: string; Status: string; Number: number; Series: number; AccessKey: string; BranchCode: string;
	EndorsementStatus: string; FinancialError: string;
};

type TitleRow = { Key: string; Code: string; DueDate: string; NetAmount: number; Status: string };

/** Filhos da averbação com $select explícito. */
const ENDORSEMENTS_EXPAND = ",Endorsements($select=EndorsementNumber,InsurerTaxId,InsurerName,PolicyNumber,Amount,Branch,MovementType)";

const actionsFor = (doc: DetailDoc, averbaEnabled: boolean, hasTitle: boolean) => ({
	...cteActions(doc?.Status ?? "", doc?.Number ?? null),
	endorse: canEndorse(doc?.Status, doc?.EndorsementStatus, averbaEnabled),
	resendEndorsementCancellation: doc?.EndorsementStatus === "CancellationPending",
	sendEmail: doc?.Status === "Authorized" || doc?.Status === "Cancelled",
	generateTitle: doc?.Status === "Authorized" && !hasTitle,
});

/**
 * Detalhe do CT-e (ObjectPage). Lê por fetch num JSONModel e mostra os botões conforme a
 * situação (cteActions, as mesmas travas dos serviços). Mensagens de negócio chegam como 400 texto.
 * @namespace siagrob1.controller.transportDocuments
 */
export default class Detail extends BaseController {
	cteStatusText = cteStatusText;
	cteStatusState = cteStatusState;
	formatAccessKey = formatAccessKey;
	takerRoleText = takerRoleText;
	partyRoleText = partyRoleText;
	quantityUnitText = quantityUnitText;
	endorsementStatusText = endorsementStatusText;
	endorsementStatusState = endorsementStatusState;

	private key: string;
	private nfeEmail: NfeEmailHelper;

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "doc");
		this.getView().setModel(new JSONModel(actionsFor(null, false, false)), "act");
		this.getView().setModel(new JSONModel([]), "titles");
		this.getView().setModel(new JSONModel({}), "mdfe");
		this.getView().setModel(new JSONModel({}), "freightInvoice");
		this.nfeEmail = new NfeEmailHelper(this.getView(), 3, ServerRoutes.transportDocumentsSendEmail);
		this.getRouter().getRoute("transportDocumentsDetail").attachPatternMatched((ev: Route$MatchedEvent) => {
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
		(this.getView().getModel("act") as JSONModel).setData(actionsFor(null, false, false));
		(this.getView().getModel("titles") as JSONModel).setData([]);
		(this.getView().getModel("mdfe") as JSONModel).setData({});
		(this.getView().getModel("freightInvoice") as JSONModel).setData({});
		this.setBusy(true);
		try {
			const result = await sendJson("GET",
				`${ServerRoutes.transportDocuments}(${encodeURIComponent(this.key)})?${TRANSPORT_DOCUMENT_EXPAND}` +
				",Corrections($select=Sequence,SentAt,Protocol,ItemsJson)" + ENDORSEMENTS_EXPAND);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const doc = odataValue<DetailDoc>(result.data);
			(this.getView().getModel("doc") as JSONModel).setData(doc);
			const [averbaEnabled, titles] = await Promise.all([this.loadAverbaEnabled(doc.BranchCode), this.loadTitles(doc.Key)]);
			(this.getView().getModel("titles") as JSONModel).setData(titles);
			(this.getView().getModel("act") as JSONModel).setData(actionsFor(doc, averbaEnabled, titles.length > 0));
			await Promise.all([this.loadManifestLink(doc.Key), this.loadFreightInvoiceLink(doc.Key)]);
		} finally {
			this.setBusy(false);
		}
	}

	/** MDF-e do CT-e (ativo, senão o último). 204 sem corpo = nenhum; falha não atrapalha o detalhe. */
	private async loadManifestLink(key: string): Promise<void> {
		const result = await sendJson("GET", `${ServerRoutes.transportDocumentsManifest}(Key=${encodeURIComponent(key)})`);
		const link = result.ok && result.data && typeof result.data === "object" ? odataValue<CteManifestLink>(result.data) : null;
		(this.getView().getModel("mdfe") as JSONModel).setData(link?.ManifestKey ? { ...link, text: manifestLinkText(link) } : {});
	}

	/** Fatura de frete não cancelada com item ativo deste CT-e; falha não atrapalha o detalhe. */
	private async loadFreightInvoiceLink(key: string): Promise<void> {
		const result = await sendJson("GET", `${ServerRoutes.freightInvoices}?$filter=${encodeURIComponent(invoiceOfCteFilter(key))}&$select=Key,Code&$top=1`);
		const invoice = result.ok ? odataCollection<{ Key: string; Code: string }>(result.data)[0] : null;
		(this.getView().getModel("freightInvoice") as JSONModel).setData(invoice ?? {});
	}

	onOpenFreightInvoice(): void {
		const key = (this.getView().getModel("freightInvoice") as JSONModel).getProperty("/Key") as string;
		if (key) {
			this.navTo("freightInvoicesDetail", { id: key });
		}
	}

	onOpenManifest(): void {
		const key = (this.getView().getModel("mdfe") as JSONModel).getProperty("/ManifestKey") as string;
		if (key) {
			this.navTo("transportManifestsDetail", { id: key });
		}
	}

	/** AT&M ligada na filial? Falha = false (o servidor continua sendo quem trava). */
	private async loadAverbaEnabled(branchCode: string): Promise<boolean> {
		if (!branchCode) {
			return false;
		}
		const result = await sendJson("GET", `${ServerRoutes.branchTransportSettingsGet}(BranchCode='${encodeURIComponent(branchCode)}')`);
		return result.ok && odataValue<{ AverbaEnabled?: boolean }>(result.data)?.AverbaEnabled === true;
	}

	/** Títulos a receber gerados pelo CT-e (origem TransportDocument, OriginKey = chave do documento). */
	private async loadTitles(key: string): Promise<TitleRow[]> {
		const result = await sendJson("GET", `${ServerRoutes.financialDocuments}?$filter=OriginType eq 'TransportDocument' and OriginKey eq ${key}` +
			"&$select=Key,Code,DueDate,NetAmount,Status&$orderby=DueDate");
		return result.ok ? odataCollection<TitleRow>(result.data) : [];
	}

	/** Ação da AT&M: devolve { Success, Message }. */
	private async runAverba(url: string): Promise<void> {
		this.setBusy(true);
		try {
			const result = await sendJson("POST", url, { Key: this.key });
			if (!result.ok) {
				MessageBox.error(result.message);
			} else {
				const outcome = odataValue<{ Success: boolean; Message: string }>(result.data);
				if (outcome?.Success) {
					MessageBox.success(outcome.Message || "Averbação registrada.");
				} else {
					MessageBox.warning(outcome?.Message || "A AT&M não confirmou a operação.");
				}
			}
		} finally {
			this.setBusy(false);
		}
		await this.reload();
	}

	async onEndorse(): Promise<void> {
		if (await confirmDialog("Enviar este CT-e para averbação na AT&M?", "Averbar CT-e?")) {
			await this.runAverba(ServerRoutes.transportDocumentsEndorse);
		}
	}

	async onResendEndorsementCancellation(): Promise<void> {
		await this.runAverba(ServerRoutes.transportDocumentsResendEndorsementCancellation);
	}

	async onGenerateTitle(): Promise<void> {
		await this.run(ServerRoutes.transportDocumentsGenerateTitle, {}, "Título a receber gerado.");
	}

	async onSendEmail(): Promise<void> {
		await this.nfeEmail.send(this.key, (busy) => this.setBusy(busy));
	}

	onOpenTitle(ev: Link$PressEvent): void {
		this.navTo("financialDocumentsDetail", { id: ev.getSource().getBindingContext("titles").getProperty("Key") as string });
	}

	/** Ação simples (só Key) com mensagem de sucesso. */
	private async run(url: string, body: object, success: string): Promise<void> {
		this.setBusy(true);
		try {
			const result = await sendJson("POST", url, { Key: this.key, ...body });
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
		this.navTo("transportDocuments");
	}

	onEdit(): void {
		this.navTo("transportDocumentsEdit", { id: this.key });
	}

	async onConfirm(): Promise<void> {
		if (await confirmDialog("Confirmar o CT-e? O número e a chave são gerados agora e não mudam mais.", "Confirmar CT-e?")) {
			await this.run(ServerRoutes.transportDocumentsConfirm, {}, "CT-e confirmado.");
		}
	}

	async onReopen(): Promise<void> {
		await this.run(ServerRoutes.transportDocumentsReopen, {}, "CT-e reaberto.");
	}

	async onTransmit(): Promise<void> {
		await this.runSefaz(ServerRoutes.transportDocumentsTransmit);
	}

	async onConsult(): Promise<void> {
		await this.runSefaz(ServerRoutes.transportDocumentsConsult);
	}

	async onDacte(): Promise<void> {
		const doc = this.doc();
		await openAttachmentViewer({
			url: `${ServerRoutes.dacteReport}/${this.key}`,
			method: "GET",
			errorMessage: "Falha ao gerar o DACTE.",
			title: `DACTE – CT-e nº ${doc.Number} série ${doc.Series}`,
			fileName: `${doc.AccessKey}-dacte.pdf`,
		});
	}

	async onCancelCte(): Promise<void> {
		const justification = await openNfeCancelDialog(this.getView(), {
			title: "Cancelar CT-e",
			confirm: "Cancelar CT-e",
			warning: "O cancelamento é enviado à SEFAZ e não pode ser desfeito (prazo de 168 horas da autorização).",
		});
		if (justification === null) {
			return;
		}
		const error = cancellationJustificationError(justification);
		if (error) {
			MessageBox.error(error);
			return;
		}
		await this.runSefaz(ServerRoutes.transportDocumentsCancel, { Justification: justification });
	}

	async onCorrection(): Promise<void> {
		const rows = await openCteCorrectionDialog(this.getView());
		if (rows === null) {
			return;
		}
		await this.runSefaz(ServerRoutes.transportDocumentsSendCorrection, buildCorrectionPayload(this.key, rows));
	}

	async onDiscardNumber(): Promise<void> {
		const reason = await openNfeCancelDialog(this.getView(), {
			title: "Descartar número do CT-e",
			confirm: "Descartar",
			warning: "O número volta para a fila de inutilização da filial e o CT-e fica em rascunho, sem número nem chave.",
		});
		if (reason !== null) {
			await this.run(ServerRoutes.transportDocumentsDiscardNumber, { Reason: reason }, "Número descartado.");
		}
	}
}
