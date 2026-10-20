import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import CommonController from "siagrob1/controller/common/CommonController";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";
import { monthRange } from "siagrob1/helpers/FinancialAccountMovementHelpers";

/** Espelha FinancialDirection / FinancialPositionMode do servidor (a API de relatórios lê enum numérico). */
const DIRECTION = { Receivable: 0, Payable: 1 } as const;
const MODE = { Firm: 0, Provisional: 1 } as const;

type Params = {
	Title: string; Direction: number; DateFrom: string; DateTo: string; Mode: string;
	CardCode: string; CardName: string; AccountCode: string; AccountName: string;
};

const ROUTES: Record<string, { title: string; direction: number }> = {
	receivableSettlementsReport: { title: "Baixas de Recebíveis", direction: DIRECTION.Receivable },
	payableSettlementsReport: { title: "Baixas de Pagáveis", direction: DIRECTION.Payable },
};

/**
 * Baixas de títulos a receber / a pagar em PDF. A mesma view atende as duas rotas: título e direção vêm da rota.
 * @namespace siagrob1.controller.reports.financialSettlements
 */
export default class Main extends CommonController {
	onInit(): void {
		this.getView().setModel(new JSONModel(), "params");
		for (const name of Object.keys(ROUTES)) {
			this.getRouter().getRoute(name).attachPatternMatched((ev: Route$PatternMatchedEvent) => this.onRouteMatched(ev));
		}
	}

	private onRouteMatched(ev: Route$PatternMatchedEvent): void {
		const route = ROUTES[ev.getParameter("name")];
		const { from, to } = monthRange(new Date());
		(this.getModel("params") as JSONModel).setData({
			Title: route.title, Direction: route.direction, DateFrom: from, DateTo: to,
			Mode: "Firm", CardCode: "", CardName: "", AccountCode: "", AccountName: "",
		});
	}

	async openPartnerValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		await this.applyValueHelp(ev, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"], "CardCode");
	}

	async openAccountValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		await this.applyValueHelp(ev, "FinancialAccountsSelectDialog", ["Code", "Name"], "Code",
			[new Filter("Inactive", FilterOperator.EQ, false)]);
	}

	async onPrintReport(): Promise<void> {
		const p = (this.getModel("params") as JSONModel).getData() as Params;

		if (!p.DateFrom || !p.DateTo) { MessageBox.warning("Informe o período."); return; }
		if (p.DateFrom > p.DateTo) { MessageBox.warning("A data inicial deve ser menor ou igual à final."); return; }

		try {
			this.setBusy(true);
			await openPdfReport(this.api.financialSettlementsReport, {
				Direction: p.Direction, DateFrom: p.DateFrom, DateTo: p.DateTo,
				Mode: MODE[p.Mode as keyof typeof MODE], CardCode: p.CardCode || null, AccountCode: p.AccountCode || null,
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}
}
