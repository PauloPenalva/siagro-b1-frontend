import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import { InputBase$ChangeEvent } from "sap/m/InputBase";
import { Select$ChangeEvent } from "sap/m/Select";
import Context from "sap/ui/model/odata/v4/Context";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import RootBaseController from "../BaseController";
import SimpleForm from "sap/ui/layout/form/SimpleForm";
import Title from "sap/ui/core/Title";
import { bindSimpleFormGroupVisible } from "siagrob1/helpers/SimpleFormGroupHelpers";

/**
 * Base das telas de natureza (inclusão e edição): o value help da natureza de devolução.
 * @namespace siagrob1.controller.usages
 */
export default class BaseController extends RootBaseController {

	/**
	 * O grupo "Contribuição Social" só existe na natureza de ENTRADA. O core:Title não tem visible (o UI5 avisava
	 * FUTURE FATAL), então o visible vai no grupo que o SimpleForm cria para o título. Chamado no onInit da inclusão
	 * e da edição, que usam o mesmo fragmento.
	 */
	protected bindRuralContributionGroupVisibility(): void {
		const form = this.byId("usagesTaxationForm") as SimpleForm | undefined;
		const title = this.byId("usagesRuralContributionTitle") as unknown as Title | undefined;
		if (!form || !title) return;
		bindSimpleFormGroupVisible(form, title, {
			path: "Direction",
			targetType: "any",
			formatter: (direction: unknown) => direction === "Incoming",
		});
	}

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
	 * é limpo. "Permite contra-nota" só vale para Entrada e a caixa some fora dela: marcada e escondida, o servidor recusa
	 * gravar a natureza de saída sem o usuário ter como desmarcar — então também é limpa. Sem await: o contexto está num
	 * update group diferido.
	 */
	onDirectionChange(ev: Select$ChangeEvent) {
		const oTarget = ev.getSource().getBindingContext() as Context;
		void oTarget.setProperty("ReturnUsageCode", null);
		void oTarget.setProperty("ReturnUsageName", null);
		void oTarget.setProperty("AllowsCounterNote", false);
	}
}
