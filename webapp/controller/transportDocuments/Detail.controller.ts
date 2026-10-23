import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import { openAttachmentViewer } from "siagrob1/dialogs/AttachmentViewer";
import { openCteCorrectionDialog } from "siagrob1/dialogs/CteCorrectionDialog";
import { openNfeCancelDialog } from "siagrob1/dialogs/NfeCancelDialog";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
	buildCorrectionPayload, cancellationJustificationError, cteActions, cteStatusState, cteStatusText,
	TRANSPORT_DOCUMENT_EXPAND, formatAccessKey, partyRoleText, quantityUnitText, sefazOutcome, takerRoleText,
} from "siagrob1/helpers/CteHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import BaseController from "../BaseController";

type DetailDoc = { Key: string; Status: string; Number: number; Series: number; AccessKey: string };

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

	private key: string;

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "doc");
		this.getView().setModel(new JSONModel(cteActions("", null)), "act");
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
		(this.getView().getModel("act") as JSONModel).setData(cteActions("", null));
		this.setBusy(true);
		try {
			const result = await sendJson("GET",
				`${ServerRoutes.transportDocuments}(${encodeURIComponent(this.key)})?${TRANSPORT_DOCUMENT_EXPAND}` +
				",Corrections($select=Sequence,SentAt,Protocol,ItemsJson)");
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const doc = odataValue<DetailDoc>(result.data);
			(this.getView().getModel("doc") as JSONModel).setData(doc);
			(this.getView().getModel("act") as JSONModel).setData(cteActions(doc.Status, doc.Number));
		} finally {
			this.setBusy(false);
		}
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
