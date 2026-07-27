import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import BaseController from "./BaseController";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * @namespace siagrob1.controller.reports.purchaseContractsByItem
 */
export default class Main extends BaseController {

	onInit(): void {
		const paramsModel = new JSONModel();
		this.getView().setModel(paramsModel, "params");

		this.getRouter()
			.getRoute("purchaseContractsByItemReport")
			.attachPatternMatched(() => this.routeMatched());
	}

	private routeMatched() {

		this.clearStates("purchaseContractsByItemForm");

		const paramsModel = this.getModel("params") as JSONModel;
		paramsModel.setData({});
	}

	async onPrintReport() {

		if (!this.validateForm("purchaseContractsByItemForm")) {
			MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
			return;
		}

		const paramsModel = this.getModel("params") as JSONModel;
		const payload = paramsModel.getData() as object;

		try {

			this.setBusy(true);

			const response = await fetch(ServerRoutes.purchaseContractsByItemReport, {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				throw new Error("Falha ao gerar relatório.");
			}

			const blob = await response.blob();
			const fileURL = URL.createObjectURL(blob);

			// abre em nova aba
			window.open(fileURL, "_blank");

			// opcional: liberar memória depois de um tempo
			setTimeout(() => URL.revokeObjectURL(fileURL), 60000);

		} catch (error) {
			const err = error as Error;
			MessageBox.error(err?.message);
		} finally {
			this.setBusy(false);
		}
	}

}
