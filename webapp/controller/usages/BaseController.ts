import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import { InputBase$ChangeEvent } from "sap/m/InputBase";
import { Select$ChangeEvent } from "sap/m/Select";
import Context from "sap/ui/model/odata/v4/Context";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import RootBaseController from "../BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * Base das telas de natureza (inclusão, edição e detalhe): modo ERP, edição e o value help da natureza de devolução.
 * @namespace siagrob1.controller.usages
 */
export default class BaseController extends RootBaseController {

	/**
	 * ui>/editable liga os campos dos fragmentos: true na inclusão e na edição, false no detalhe (só leitura).
	 */
	protected setEditable(editable: boolean): void {
		(this.getModel("ui") as JSONModel).setProperty("/editable", editable);
	}

	/**
	 * Em SAPB1 a identidade fiscal (nome, descrição, CFOP) vem do OUSG e é somente-leitura;
	 * o efeito no contrato continua editável, porque é do Siagro. Inicializar como `true`
	 * antes da resposta manteria o comportamento do STANDALONE, que é o caso permissivo.
	 */
	protected async applyErpMode(): Promise<void> {
		const uiModel = this.getModel("ui") as JSONModel;
		const systemInfo = await this.getSystemInfo();

		uiModel.setProperty("/identityEditable", systemInfo?.erp !== "SAPB1");
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
