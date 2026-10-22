import { Button$PressEvent } from "sap/m/Button";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { buildCombinationSavePayload, CombinationForm } from "siagrob1/helpers/TransportHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import CommonController from "../common/CommonController";

const MAX_TRAILERS = 3;

interface CombinationRead {
	Code: string;
	Description: string;
	TractionTruckCode: string;
	DefaultDriverCode: string;
	Inactive: boolean;
	Trailers: { Position: number; TrailerTruckCode: string }[];
}

/**
 * Inclusão e edição do conjunto de veículos. Grava pela ação TruckCombinationsSave, que substitui
 * os reboques de uma vez (o PATCH do OData não faz isso).
 * @namespace siagrob1.controller.truckCombinations
 */
export default class Form extends CommonController {

	onInit(): void {
		this.getView().setModel(new JSONModel(this.empty()), "combo");
		this.getRouter().getRoute("truckCombinationsNew").attachPatternMatched(() => this.combo().setData(this.empty()));
		this.getRouter().getRoute("truckCombinationsEdit").attachPatternMatched((ev) => void this.load(ev));
	}

	private combo(): JSONModel {
		return this.getView().getModel("combo") as JSONModel;
	}

	private empty(): CombinationForm {
		return { IsNew: true, Code: "", Description: "", TractionTruckCode: "", DefaultDriverCode: "", Inactive: false, Trailers: [] };
	}

	private async load(ev: Route$MatchedEvent): Promise<void> {
		const { id } = ev.getParameter("arguments") as { id: string };
		const code = decodeURIComponent(id);
		this.setBusy(true);
		try {
			const result = await sendJson("GET", `${ServerRoutes.truckCombinations}('${encodeURIComponent(code)}')?$expand=Trailers`);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const row = odataValue<CombinationRead>(result.data);
			this.combo().setData({
				IsNew: false,
				Code: row.Code,
				Description: row.Description,
				TractionTruckCode: row.TractionTruckCode,
				DefaultDriverCode: row.DefaultDriverCode ?? "",
				Inactive: row.Inactive,
				Trailers: [...(row.Trailers ?? [])]
					.sort((a, b) => a.Position - b.Position)
					.map((t) => ({ TrailerTruckCode: t.TrailerTruckCode })),
			} satisfies CombinationForm);
		} finally {
			this.setBusy(false);
		}
	}

	private trailers(): { TrailerTruckCode: string }[] {
		return (this.combo().getProperty("/Trailers") as { TrailerTruckCode: string }[]) ?? [];
	}

	private rowIndex(ev: Button$PressEvent): number {
		const path = ev.getSource().getBindingContext("combo").getPath();
		return Number(path.split("/").pop());
	}

	onAddTrailer(): void {
		const list = this.trailers();
		if (list.length >= MAX_TRAILERS) {
			return;
		}
		this.combo().setProperty("/Trailers", [...list, { TrailerTruckCode: "" }]);
	}

	onRemoveTrailer(ev: Button$PressEvent): void {
		const i = this.rowIndex(ev);
		this.combo().setProperty("/Trailers", this.trailers().filter((_, index) => index !== i));
	}

	onMoveTrailer(ev: Button$PressEvent, step: number): void {
		const i = this.rowIndex(ev);
		const target = i + step;
		const list = [...this.trailers()];
		if (target < 0 || target >= list.length) {
			return;
		}
		[list[i], list[target]] = [list[target], list[i]];
		this.combo().setProperty("/Trailers", list);
	}

	async onSave(): Promise<void> {
		const payload = buildCombinationSavePayload(this.combo().getData() as CombinationForm);
		if (!payload.Code || !payload.Description || !payload.TractionTruckCode) {
			MessageBox.warning("Informe código, descrição e veículo de tração.");
			return;
		}

		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.truckCombinationsSave, payload);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			MessageToast.show("Conjunto gravado.", { closeOnBrowserNavigation: false });
			this.navTo("truckCombinations");
		} finally {
			this.setBusy(false);
		}
	}

	onCancel(): void {
		this.navTo("truckCombinations");
	}
}
