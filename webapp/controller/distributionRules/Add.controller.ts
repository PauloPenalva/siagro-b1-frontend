import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { buildCreateRuleBody, validateRuleLines } from "siagrob1/helpers/DistributionRuleHelpers";
import DistributionRulesBaseController from "./DistributionRulesBaseController";

/**
 * @namespace siagrob1.controller.distributionRules
 */
export default class Add extends DistributionRulesBaseController {

	onInit(): void {
		this.getView().setModel(new JSONModel(), "rule");
		this.getRouter().getRoute("distributionRulesNew").attachPatternMatched(() => this.newRouteMatched());
	}

	private newRouteMatched() {
		this.ruleModel().setData({
			Header: { Code: "", Name: "" },
			Selected: { ValidFrom: "" },
			Lines: [{ CostCenterCode: "", AccountingItemCode: "", Percentage: null }],
			Editable: true,
			Total: 0,
			TotalOk: false,
			TotalText: ""
		});
		this.recomputeTotal();
	}

	async onSave() {
		const model = this.ruleModel();
		const header = model.getProperty("/Header") as { Code: string; Name: string };
		const validFrom = model.getProperty("/Selected/ValidFrom") as string;
		const lines = this.lines();

		if (!header.Code?.trim() || !header.Name?.trim() || !validFrom) {
			MessageBox.warning("Informe código, nome e a vigência da primeira versão.");
			return;
		}

		const problem = validateRuleLines(lines);
		if (problem) {
			MessageBox.warning(problem);
			return;
		}

		const body = buildCreateRuleBody(
			{ Code: header.Code, Name: header.Name },
			validFrom,
			lines);

		this.setBusy(true);
		try {
			const result = await sendJson("POST", "/odata/DistributionRules", body);

			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}

			MessageToast.show("Dados salvos com sucesso.", { closeOnBrowserNavigation: false });
			this.navTo("distributionRulesEdit", { id: body.Code }, true);
		} finally {
			this.setBusy(false);
		}
	}

	onCancel(): void {
		this.onNavBack();
	}
}
