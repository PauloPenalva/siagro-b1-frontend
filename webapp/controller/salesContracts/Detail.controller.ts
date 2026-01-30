import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import SalesContractsBaseController from "./SalesContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import RequestModel from "siagrob1/model/RequestModel";
import { SalesContractsTotals } from "siagrob1/types/SalesContractsTotal";

/**
 * @namespace siagrob1.controller.salesContracts
 */
export default class Detail extends SalesContractsBaseController {

	onInit(): void  {	
		this.getRouter().getRoute("salesContractsDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const {id} = ev.getParameter("arguments") as {id: string };
    const viewModel = this.getModel("viewModel") as JSONModel;
    const uiModel = this.getModel("ui") as JSONModel;

		if (id != null) {

      uiModel.setProperty("/editable", false);
      
			const sPath = `/SalesContracts(${id})`;
			this.bindElement(sPath);
      this.getInvoices(id);

      const requestModel = new RequestModel({Key: id});
      requestModel.get(this.api.salesContractsGetTotals.replace("$", id))
        .then((data: SalesContractsTotals) => {
          viewModel.setProperty("/TotalPrice", data.TotalPrice ?? 0)
          viewModel.setProperty("/TotalVolume", data.TotalVolume ?? 0)
        });

			return;
		}

	}

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("salesContractsEdit", {id: oContext.getProperty("Key") as string });
    }
  }

}
