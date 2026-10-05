import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import { InputBase$ChangeEvent } from "sap/m/InputBase";
import { Select$ChangeEvent } from "sap/m/Select";
import Context from "sap/ui/model/odata/v4/Context";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import RootBaseController from "../BaseController";

/**
 * Base das telas de natureza (inclusão e edição): o value help da natureza de devolução.
 * @namespace siagrob1.controller.usages
 */
export default class BaseController extends RootBaseController {

	/**
	 * Só natureza ativa do sentido OPOSTO ao desta natureza: Saída → Entrada, Entrada → Saída. O enum vai
	 * como $filter estático (o Filter do UI5 não formata enum). setProperty sem await: no update group
	 * diferido a Promise só resolve no submit.
	 */
	async onReturnUsageValueHelp(ev: Input$ValueHelpRequestEvent) {
		const oTarget = ev.getSource().getBindingContext() as Context;
		const direction = oTarget.getProperty("Direction") as string;
		const opposite = direction === "Incoming" ? "Outgoing" : "Incoming";

		const oSelected = await DialogHelper.openTableSelectDialog(
			this, "UsagesSelectDialog", ["Name", "Description"],
			[new Filter("Inactive", FilterOperator.EQ, false)], undefined, `Direction eq '${opposite}'`);

		if (!oSelected) {
			return;
		}

		void oTarget.setProperty("ReturnUsageCode", oSelected.getProperty("Code"));
		void oTarget.setProperty("ReturnUsageName", oSelected.getProperty("Name"));
	}

	/** Limpar o código (ícone de limpar) limpa também o nome exibido ao lado. */
	onReturnUsageChange(ev: InputBase$ChangeEvent) {
		if (ev.getParameter("value")) {
			return;
		}

		const oTarget = ev.getSource().getBindingContext() as Context;
		void oTarget.setProperty("ReturnUsageName", null);
	}

	/**
	 * A natureza de devolução é do sentido oposto: trocar o tipo invalida a escolhida antes, então o vínculo
	 * é limpo. Sem await: o contexto está num update group diferido.
	 */
	onDirectionChange(ev: Select$ChangeEvent) {
		const oTarget = ev.getSource().getBindingContext() as Context;
		void oTarget.setProperty("ReturnUsageCode", null);
		void oTarget.setProperty("ReturnUsageName", null);
	}
}
