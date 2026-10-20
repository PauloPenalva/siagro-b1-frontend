import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import JSONModel from "sap/ui/model/json/JSONModel";
import CommonController from "siagrob1/controller/common/CommonController";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";
import { DIRECTION, MODE } from "siagrob1/helpers/FinancialReportHelpers";
import { monthRange } from "siagrob1/helpers/FinancialAccountMovementHelpers";

type Params = { Direction: string; DateFrom: string; DateTo: string; Mode: string; CardCode: string; CardName: string };

/**
 * Extrato do parceiro em PDF: títulos e baixas do período, a receber e/ou a pagar.
 * @namespace siagrob1.controller.reports.partnerStatement
 */
export default class Main extends CommonController {
	onInit(): void {
		this.getView().setModel(new JSONModel(), "params");
		this.getRouter().getRoute("partnerStatementReport").attachPatternMatched(() => {
			const { from, to } = monthRange(new Date());
			(this.getModel("params") as JSONModel).setData({
				Direction: "Both", DateFrom: from, DateTo: to, Mode: "Firm", CardCode: "", CardName: "",
			} as Params);
		});
	}

	async openPartnerValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		await this.applyValueHelp(ev, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"], "CardCode");
	}

	async onPrintReport(): Promise<void> {
		const p = (this.getModel("params") as JSONModel).getData() as Params;

		if (!p.CardCode) { MessageBox.warning("Informe o parceiro."); return; }
		if (!p.DateFrom || !p.DateTo) { MessageBox.warning("Informe o período."); return; }
		if (p.DateFrom > p.DateTo) { MessageBox.warning("A data inicial deve ser menor ou igual à final."); return; }

		try {
			this.setBusy(true);
			await openPdfReport(this.api.partnerStatementReport, {
				CardCode: p.CardCode, DateFrom: p.DateFrom, DateTo: p.DateTo,
				Direction: p.Direction === "Both" ? null : DIRECTION[p.Direction as keyof typeof DIRECTION],
				Mode: MODE[p.Mode as keyof typeof MODE],
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}
}
