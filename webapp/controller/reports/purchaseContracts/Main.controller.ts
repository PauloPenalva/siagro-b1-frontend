import JSONModel from "sap/ui/model/json/JSONModel";
import BaseController from "./BaseController";

/**
 * @namespace siagrob1.controller.reports.purchaseContracts
 */
export default class Main extends BaseController {

	onInit(): void | undefined {
		
    this.getRouter().getRoute("purchaseContractsReport").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		const viewModel = this.getModel("viewModel") as JSONModel;
    viewModel.setProperty("/Source", "/reports/PurchaseContracts");
    viewModel.setProperty("/Title", "Contratos de Compra");
    viewModel.setProperty("/Height", "100vh");
	}

	onRefresh(): void | undefined {
		
	}

}
