import { ListItemBase$PressEvent } from "sap/m/ListItemBase";
import { Link$PressEvent } from "sap/m/Link";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { dueDateText, freightInvoiceActions, freightInvoiceStatusState, freightInvoiceStatusText } from "siagrob1/helpers/FreightInvoiceHelpers";
import { dateText } from "siagrob1/helpers/FreightOrderHelpers";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import CommonController from "../common/CommonController";

/**
 * Detalhe da fatura de frete (ObjectPage): dados, CT-e (itens ativos) e títulos gerados
 * (FinancialDocuments com origem FreightInvoice). Emitir, Cancelar e Imprimir.
 * @namespace siagrob1.controller.freightInvoices
 */
export default class Detail extends CommonController {
	statusText = freightInvoiceStatusText;
	statusState = freightInvoiceStatusState;
	dateText = dateText;

	private key: string;

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "doc");
		this.getView().setModel(new JSONModel([]), "items");
		this.getView().setModel(new JSONModel([]), "titles");
		this.getView().setModel(new JSONModel(freightInvoiceActions("")), "act");
		this.getRouter().getRoute("freightInvoicesDetail").attachPatternMatched((ev: Route$MatchedEvent) => {
			void this.refreshStandaloneFlag();
			this.key = (ev.getParameter("arguments") as { id: string }).id;
			void this.reload();
		});
	}

	private async reload(): Promise<void> {
		// Mesma fatura: mantém o cabeçalho na tela durante o recarregamento (não "pisca" vazio).
		const doc0 = (this.getView().getModel("doc") as JSONModel).getData() as { Key?: string };
		if (doc0?.Key !== this.key) {
			(this.getView().getModel("doc") as JSONModel).setData({});
			(this.getView().getModel("items") as JSONModel).setData([]);
			(this.getView().getModel("titles") as JSONModel).setData([]);
			(this.getView().getModel("act") as JSONModel).setData(freightInvoiceActions(""));
			(this.getModel("ui") as JSONModel).setProperty("/freightInvoiceDueText", "");
		}
		this.setBusy(true);
		try {
			const [invoice, titles] = await Promise.all([
				sendJson("GET", `${ServerRoutes.freightInvoices}(${encodeURIComponent(this.key)})`
					+ "?$expand=Items($orderby=LineNum;$expand=TransportDocument($select=Key,Number,Series,IssuedAt))"),
				sendJson("GET", `${ServerRoutes.financialDocuments}?$filter=OriginType eq 'FreightInvoice' and OriginKey eq ${encodeURIComponent(this.key)}`
					+ "&$select=Key,Code,DueDate,NetAmount,Status&$orderby=DueDate"),
			]);
			if (!invoice.ok) {
				MessageBox.error(invoice.message);
				return;
			}
			const doc = odataValue<Record<string, unknown>>(invoice.data);
			(this.getView().getModel("doc") as JSONModel).setData(doc);
			(this.getView().getModel("items") as JSONModel).setData((doc.Items as object[]) ?? []);
			(this.getView().getModel("act") as JSONModel).setData(freightInvoiceActions(doc.Status as string));
			const titleRows = titles.ok ? odataCollection<{ DueDate: string }>(titles.data) : [];
			(this.getView().getModel("titles") as JSONModel).setData(titleRows);
			await this.refreshPaymentConditionName(doc.PaymentConditionCode as number);
			const ui = this.getModel("ui") as JSONModel;
			ui.setProperty("/freightInvoiceDueText", dueDateText(titleRows.map((t) => t.DueDate), doc.DueDate as string,
				ui.getProperty("/paymentConditionName") as string));
		} finally {
			this.setBusy(false);
		}
	}

	private async run(url: string, success: string): Promise<boolean> {
		this.setBusy(true);
		try {
			const result = await sendJson("POST", url, { Key: this.key });
			if (!result.ok) {
				MessageBox.error(result.message);
				return false;
			}
			MessageToast.show(success);
			return true;
		} finally {
			this.setBusy(false);
		}
	}

	onBack(): void {
		this.navTo("freightInvoices");
	}

	onEdit(): void {
		this.navTo("freightInvoicesEdit", { id: this.key });
	}

	onOpenCte(ev: ListItemBase$PressEvent): void {
		const key = ev.getSource().getBindingContext("items").getProperty("TransportDocumentKey") as string;
		if (key) {
			this.navTo("transportDocumentsDetail", { id: key });
		}
	}

	onOpenTitle(ev: Link$PressEvent): void {
		this.navTo("financialDocumentsDetail", { id: ev.getSource().getBindingContext("titles").getProperty("Key") as string });
	}

	async onIssue(): Promise<void> {
		if (await confirmDialog("Emitir a fatura? Os títulos dos CT-e serão baixados e o título da fatura será gerado.", "Emitir fatura?")
			&& await this.run(ServerRoutes.freightInvoicesIssue, "Fatura emitida.")) {
			await this.reload();
		}
	}

	async onCancelInvoice(): Promise<void> {
		if (await confirmDialog("Cancelar a fatura? Os títulos dos CT-e voltam a ficar em aberto.", "Cancelar fatura?")
			&& await this.run(ServerRoutes.freightInvoicesCancel, "Fatura cancelada.")) {
			await this.reload();
		}
	}

	async onPrint(): Promise<void> {
		this.setBusy(true);
		try {
			await openPdfReport(`${ServerRoutes.freightInvoicesReport}/${encodeURIComponent(this.key)}/print`, {});
		} catch (e) {
			MessageBox.error((e as Error).message);
		} finally {
			this.setBusy(false);
		}
	}
}
