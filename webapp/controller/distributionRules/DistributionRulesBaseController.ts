import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Input$ValueHelpRequestEvent, Input$LiveChangeEvent } from "sap/m/Input";
import { Button$PressEvent } from "sap/m/Button";
import CommonController from "../common/CommonController";
import { RuleLine, sumPercentages } from "siagrob1/helpers/DistributionRuleHelpers";

/**
 * Pedaços comuns de Add/Edit da regra de distribuição: edição das linhas sobre o JSONModel `rule`
 * (`/Lines`, `/Header`, `/Editable`) e o total ao vivo.
 *
 * @namespace siagrob1.controller.distributionRules
 */
export default abstract class DistributionRulesBaseController extends CommonController {

	protected ruleModel(): JSONModel {
		return this.getView().getModel("rule") as JSONModel;
	}

	protected lines(): RuleLine[] {
		return (this.ruleModel().getProperty("/Lines") as RuleLine[]) ?? [];
	}

	/** Atualiza o total mostrado; `override` troca o valor de uma linha ainda não gravada no model (liveChange). */
	protected recomputeTotal(override?: { index: number; value: string }): void {
		const lines = this.lines().map((line, i) =>
			override && override.index === i ? { ...line, Percentage: Number(override.value) } : line);
		const total = sumPercentages(lines);
		const model = this.ruleModel();

		model.setProperty("/Total", total);
		model.setProperty("/TotalOk", total === 100);
		model.setProperty("/TotalText", `Total: ${total.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% de 100%`);
	}

	onAddLine(): void {
		const lines = this.lines();
		lines.push({ CostCenterCode: "", Percentage: null });
		this.ruleModel().setProperty("/Lines", lines);
		this.recomputeTotal();
	}

	onRemoveLine(ev: Button$PressEvent): void {
		const path = ev.getSource().getBindingContext("rule").getPath();
		const index = Number(path.split("/").pop());
		const lines = this.lines();

		lines.splice(index, 1);
		this.ruleModel().setProperty("/Lines", lines);
		this.recomputeTotal();
	}

	// Não grava no model dentro do liveChange (setValue ali suprime o change): só recalcula o total.
	onPercentageLiveChange(ev: Input$LiveChangeEvent): void {
		const path = ev.getSource().getBindingContext("rule").getPath();
		this.recomputeTotal({ index: Number(path.split("/").pop()), value: ev.getParameter("value") });
	}

	onPercentageChange(): void {
		this.recomputeTotal();
	}

	/** Só centros de custo ativos da dimensão da regra. */
	onRuleCostCenterValueHelp(ev: Input$ValueHelpRequestEvent): void {
		const dimension = Number(this.ruleModel().getProperty("/Header/DimensionNumber"));

		void this.applyValueHelp(ev, "CostCentersSelectDialog", ["Code", "Name"], "Code", [
			new Filter("DimensionNumber", FilterOperator.EQ, dimension),
			new Filter("Inactive", FilterOperator.EQ, false)
		]);
	}
}
