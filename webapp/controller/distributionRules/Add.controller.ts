import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { buildCreateRuleBody, isTotalValid } from "siagrob1/helpers/DistributionRuleHelpers";
import type { DimsModelData } from "siagrob1/types/AccountingDimension";
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
		const dims = (this.getOwnerComponent().getModel("dims") as JSONModel).getData() as DimsModelData;
		const firstActive = dims.items.find(item => item.Active)?.Number ?? 1;

		this.ruleModel().setData({
			Header: { Code: "", Name: "", DimensionKey: String(firstActive), DimensionNumber: firstActive },
			Selected: { ValidFrom: "" },
			Lines: [{ CostCenterCode: "", Percentage: null }],
			Editable: true,
			Total: 0,
			TotalOk: false,
			TotalText: ""
		});
		this.recomputeTotal();
	}

	/** Mantém o número da dimensão (usado no value help) e zera as linhas, que eram de outra dimensão. */
	onDimensionChange(): void {
		const model = this.ruleModel();
		model.setProperty("/Header/DimensionNumber", Number(model.getProperty("/Header/DimensionKey")));
		model.setProperty("/Lines", [{ CostCenterCode: "", Percentage: null }]);
		this.recomputeTotal();
	}

	async onSave() {
		const model = this.ruleModel();
		const header = model.getProperty("/Header") as { Code: string; Name: string; DimensionKey: string };
		const validFrom = model.getProperty("/Selected/ValidFrom") as string;
		const lines = this.lines();

		if (!header.Code?.trim() || !header.Name?.trim() || !header.DimensionKey || !validFrom) {
			MessageBox.warning("Informe código, nome, dimensão e a vigência da primeira versão.");
			return;
		}

		if (lines.length === 0 || lines.some(line => !line.CostCenterCode?.trim())) {
			MessageBox.warning("Informe o centro de custo de todas as linhas.");
			return;
		}

		if (!isTotalValid(lines)) {
			MessageBox.warning("Os percentuais das linhas devem somar exatamente 100%.");
			return;
		}

		const body = buildCreateRuleBody(
			{ Code: header.Code, Name: header.Name, DimensionNumber: Number(header.DimensionKey) },
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
