import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import BaseController from "./BaseController";
import { applyFiscalCodeLists } from "siagrob1/model/fiscalCodes";

/**
 * Detalhe só leitura da natureza de operação: os mesmos fragmentos da edição com ui>/editable = false.
 * @namespace siagrob1.controller.usages
 */
export default class Detail extends BaseController {

	private code: string;

	onInit(): void {
		this.getRouter().getRoute("usagesDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		this.setEditable(false);
		// As listas de CST de PIS/COFINS dos Select vêm do model ui.
		applyFiscalCodeLists(this.getModel("ui") as JSONModel);
		void this.applyErpMode();

		const oModel = this.getModel() as ODataModel;
		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}

		const { id } = ev.getParameter("arguments") as { id: string };
		this.code = id;

		// Chave inteira: sem aspas. Voltando da edição para o mesmo registro, o binding é reaproveitado —
		// refresh para não mostrar o que estava em cache antes da gravação.
		const sPath = `/Usages(${id})`;
		const oView = this.getView();
		const oBinding = oView.getElementBinding();
		if (oBinding?.getPath() === sPath) {
			oBinding.refresh();
			return;
		}

		oView.bindElement({
			path: sPath,
			events: {
				dataRequested: () => this.setBusy(true),
				dataReceived: () => this.setBusy(false),
			},
		});
	}

	onEdit(): void {
		this.navTo("usagesEdit", { id: this.code });
	}

	navToList(): void {
		this.navTo("usages");
	}
}
