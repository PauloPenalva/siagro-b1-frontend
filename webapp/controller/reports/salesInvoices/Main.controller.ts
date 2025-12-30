import JSONModel from "sap/ui/model/json/JSONModel";
import BaseController from "./BaseController";

/**
 * @namespace siagrob1.controller.reports.salesInvoices
 */
export default class Main extends BaseController {

	onInit(): void | undefined {
		
    this.getRouter().getRoute("salesInvoicesReport").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		const viewModel = this.getModel("viewModel") as JSONModel;
    viewModel.setProperty("/Source", "/reports/SalesInvoices");
    viewModel.setProperty("/Title", "Documentos de Saída");
    viewModel.setProperty("/Height", "600px");
	}

	onRefresh(): void | undefined {
		
	}

}
