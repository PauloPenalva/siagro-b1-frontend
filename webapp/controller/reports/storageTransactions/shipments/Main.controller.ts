import JSONModel from "sap/ui/model/json/JSONModel";
import BaseController from "./BaseController";
import MessageBox from "sap/m/MessageBox";

/**
 * @namespace siagrob1.controller.reports.storageTransactions.shipments
 */
export default class Main extends BaseController {

	onInit(): void | undefined {
		const paramsModel = new JSONModel();
    const view = this.getView();
    view.setModel(paramsModel, "params");

    this.getRouter().getRoute("storageTransactionsShipmentsReport").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
		const paramsModel = this.getModel("params") as JSONModel;
    paramsModel.setData({});
	}


  async onPrintReport() {
    const paramsModel = this.getModel("params") as JSONModel;
    const payload = paramsModel.getData();

    try {
        this.setBusy(true);
        const response = await fetch("/reports/StorageTransactions/Shipments", {
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
