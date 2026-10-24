import { ListItemBase$PressEvent } from "sap/m/ListItemBase";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import { cteStatusText } from "siagrob1/helpers/CteHelpers";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
	balanceTonsText, cteGrossWeightKg, dateText, freightOrderActions, freightOrderStatusState, freightOrderStatusText, priceMethodText, tonsText,
} from "siagrob1/helpers/FreightOrderHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import BaseController from "../BaseController";

type CteRow = {
	Key: string; Number: number; Series: number; IssuedAt: string; Status: string; ServiceTotal: number;
	Quantities: { UnitCode: string; MeasureType: string; Quantity: number }[]; weightKg?: number;
};

/**
 * Detalhe da ordem de frete (ObjectPage): dados + CT-e vinculados (por FreightOrderKey).
 * Emitir CT-e cria o rascunho no servidor e abre o formulário dele.
 * @namespace siagrob1.controller.freightOrders
 */
export default class Detail extends BaseController {
	statusText = freightOrderStatusText;
	statusState = freightOrderStatusState;
	priceMethodText = priceMethodText;
	tonsText = tonsText;
	balanceTonsText = balanceTonsText;
	dateText = dateText;
	cteStatusText = cteStatusText;

	private key: string;

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "doc");
		this.getView().setModel(new JSONModel([]), "ctes");
		this.getView().setModel(new JSONModel(freightOrderActions("")), "act");
		this.getRouter().getRoute("freightOrdersDetail").attachPatternMatched((ev: Route$MatchedEvent) => {
			void this.refreshStandaloneFlag();
			this.key = (ev.getParameter("arguments") as { id: string }).id;
			void this.reload();
		});
	}

	private async reload(): Promise<void> {
		(this.getView().getModel("doc") as JSONModel).setData({});
		(this.getView().getModel("ctes") as JSONModel).setData([]);
		(this.getView().getModel("act") as JSONModel).setData(freightOrderActions(""));
		this.setBusy(true);
		try {
			const [order, ctes] = await Promise.all([
				sendJson("GET", `${ServerRoutes.freightOrders}(${encodeURIComponent(this.key)})`),
				sendJson("GET", `${ServerRoutes.transportDocuments}?$filter=FreightOrderKey eq ${encodeURIComponent(this.key)}`
					+ "&$select=Key,Number,Series,IssuedAt,Status,ServiceTotal&$expand=Quantities($select=UnitCode,MeasureType,Quantity)"
					+ "&$orderby=Number desc"),
			]);
			if (!order.ok) {
				MessageBox.error(order.message);
				return;
			}
			const doc = odataValue<Record<string, unknown>>(order.data);
			(this.getView().getModel("doc") as JSONModel).setData(doc);
			(this.getView().getModel("act") as JSONModel).setData(freightOrderActions(doc.Status as string));
			if (ctes.ok) {
				const rows = odataCollection<CteRow>(ctes.data).map((c) => ({ ...c, weightKg: cteGrossWeightKg(c.Quantities) }));
				(this.getView().getModel("ctes") as JSONModel).setData(rows);
			}
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
		this.navTo("freightOrders");
	}

	onEdit(): void {
		this.navTo("freightOrdersEdit", { id: this.key });
	}

	onOpenCte(ev: ListItemBase$PressEvent): void {
		const key = ev.getSource().getBindingContext("ctes").getProperty("Key") as string;
		if (key) {
			this.navTo("transportDocumentsDetail", { id: key });
		}
	}

	async onCreateCte(): Promise<void> {
		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.freightOrdersCreateCte, { Key: this.key });
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			MessageToast.show("Rascunho do CT-e criado a partir da ordem.", { closeOnBrowserNavigation: false });
			this.navTo("transportDocumentsEdit", { id: odataValue<string>(result.data) });
		} finally {
			this.setBusy(false);
		}
	}

	async onClose(): Promise<void> {
		if (await confirmDialog("Encerrar a ordem de frete? Ela não aceitará novos CT-e.", "Encerrar ordem?")
			&& await this.run(ServerRoutes.freightOrdersClose, "Ordem encerrada.")) {
			await this.reload();
		}
	}

	async onCancelOrder(): Promise<void> {
		if (await confirmDialog("Cancelar a ordem de frete? Só é possível sem CT-e autorizado.", "Cancelar ordem?")
			&& await this.run(ServerRoutes.freightOrdersCancel, "Ordem cancelada.")) {
			await this.reload();
		}
	}
}
