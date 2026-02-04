import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import PurchaseContractsBaseController from "./PurchaseContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import RequestModel from "siagrob1/model/RequestModel";
import { PurchaseContractsTotals } from "siagrob1/types/PurchaseContractsTotal";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace siagrob1.controller.purchaseContracts
 */
export default class Detail extends PurchaseContractsBaseController {

	onInit(): void  {	
		this.getRouter().getRoute("purchaseContractsDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const {id} = ev.getParameter("arguments") as {id: string };
    const uiModel = this.getModel("ui") as JSONModel;

    const viewModel = this.getModel("viewModel") as JSONModel;

		if (id != null) {

      uiModel.setProperty("/editable", false);
      
			const sPath = `/PurchaseContracts(${id})`;
			this.bindElement(sPath);

      this.getAllocations(id);
      this.getAttachments(id);

      const requestModel = new RequestModel({Key: id});
      requestModel.post(this.api.purchaseContractsTotals)
        .then((data: PurchaseContractsTotals) => {
          
          viewModel.setProperty("/TotalPrice", data.TotalPrice ?? 0)
          viewModel.setProperty("/TotalTax", data.TotalTax ?? 0)
          viewModel.setProperty("/AvailableVolumeToPricing", data.AvailableVolumeToPricing ?? 0)
          viewModel.setProperty("/FixedVolume", data.FixedVolume ?? 0)
          viewModel.setProperty("/TotalAvailableToRelease", data.TotalAvailableToRelease ?? 0)
          viewModel.setProperty("/TotalShipmentReleases", data.TotalShipmentReleases ?? 0)
          viewModel.setProperty("/TotalVolume", data.TotalVolume ?? 0)
          viewModel.setProperty("/TotalStandard", data.TotalStandard ?? 0)
          viewModel.setProperty("/AvaiableVolume", data.AvaiableVolume ?? 0)
        });

			return;
		}

	}

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("purchaseContractsEdit", {id: oContext.getProperty("Key") as string });
    }
  }

}
