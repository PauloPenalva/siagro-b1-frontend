import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import CommonController from "siagrob1/controller/common/CommonController";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";
import { monthRange } from "siagrob1/helpers/FinancialAccountMovementHelpers";

type StatementParams = { AccountCode: string; AccountName: string; DateFrom: string; DateTo: string; OnlyReconciled: boolean };

/**
 * Extrato da conta financeira em PDF: saldo anterior, baixas e lançamentos manuais do período com saldo acumulado.
 * @namespace siagrob1.controller.reports.financialAccountStatement
 */
export default class Main extends CommonController {
	onInit(): void {
		this.getView().setModel(new JSONModel(), "params");
		this.getRouter().getRoute("financialAccountStatementReport")
			.attachPatternMatched(() => {
				const params = this.getModel("params") as JSONModel;
				if (params.getProperty("/DateFrom")) return; // mantém o que o usuário já escolheu
				const { from, to } = monthRange(new Date());
				params.setData({ AccountCode: "", AccountName: "", DateFrom: from, DateTo: to, OnlyReconciled: false });
			});
	}

	async openAccountValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		await this.applyValueHelp(ev, "FinancialAccountsSelectDialog", ["Code", "Name"], "Code",
			[new Filter("Inactive", FilterOperator.EQ, false)]);
	}

	async onPrintReport(): Promise<void> {
		const p = (this.getModel("params") as JSONModel).getData() as StatementParams;

		if (!p.AccountCode) { MessageBox.warning("Informe a conta financeira."); return; }
		if (!p.DateFrom || !p.DateTo) { MessageBox.warning("Informe o período."); return; }
		if (p.DateFrom > p.DateTo) { MessageBox.warning("A data inicial deve ser menor ou igual à final."); return; }

		try {
			this.setBusy(true);
			await openPdfReport(this.api.financialAccountStatementReport, {
				AccountCode: p.AccountCode, DateFrom: p.DateFrom, DateTo: p.DateTo, OnlyReconciled: !!p.OnlyReconciled,
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}
}
