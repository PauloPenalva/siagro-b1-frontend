import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import CommonController from "siagrob1/controller/common/CommonController";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";
import { monthRange } from "siagrob1/helpers/FinancialAccountMovementHelpers";

/** Espelha FinancialDirection / FinancialPositionMode do servidor (a API de relatórios lê enum numérico). */
const DIRECTION = { Receivable: 0, Payable: 1 } as const;
const MODE = { Firm: 0, Provisional: 1 } as const;

type Params = { Title: string; Direction: number; DateFrom: string; DateTo: string; Mode: string; CardCode: string; CardName: string };

const ROUTES: Record<string, { title: string; direction: number }> = {
	receivablesReport: { title: "Relatório de Contas a Receber", direction: DIRECTION.Receivable },
	payablesReport: { title: "Relatório de Contas a Pagar", direction: DIRECTION.Payable },
};

/**
 * Carteira de títulos a receber / a pagar em PDF. A mesma view atende as duas rotas: título e direção vêm da rota.
 * @namespace siagrob1.controller.reports.financialPortfolio
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
			Mode: "Firm", CardCode: "", CardName: "",
		});
	}

	async openPartnerValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		await this.applyValueHelp(ev, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"], "CardCode");
	}

	async onPrintReport(): Promise<void> {
		const p = (this.getModel("params") as JSONModel).getData() as Params;

		if (!p.DateFrom || !p.DateTo) { MessageBox.warning("Informe o período."); return; }
		if (p.DateFrom > p.DateTo) { MessageBox.warning("A data inicial deve ser menor ou igual à final."); return; }

		try {
			this.setBusy(true);
			await openPdfReport(this.api.financialPortfolioReport, {
				Direction: p.Direction, DueDateFrom: p.DateFrom, DueDateTo: p.DateTo,
				Mode: MODE[p.Mode as keyof typeof MODE], CardCode: p.CardCode || null,
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}
}
