import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import PurchaseContractsBaseController from "./PurchaseContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import RequestModel from "siagrob1/model/RequestModel";
import { PurchaseContractsTotals } from "siagrob1/types/PurchaseContractsTotal";
import { PurchaseContractRecalcResult } from "siagrob1/types/PurchaseContractRecalcResult";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";

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

  async onRecalculateBalance() {
    const oContext = this.getView().getBindingContext() as Context;
    if (!oContext) {
      return;
    }

    const bConfirm = await confirmDialog("Recalcular o saldo do contrato a partir das alocações ?");
    if (!bConfirm) {
      return;
    }

    const key = oContext.getProperty("Key") as string;
    const viewModel = this.getModel("viewModel") as JSONModel;

    this.setBusy(true);

    void jQuery.ajax({
      url: `${this.api.purchaseContractsRecalculateBalance}`,
      method: "POST",
      data: JSON.stringify({ Key: key }),
      contentType: "application/json",
      success: (data: PurchaseContractRecalcResult) => {
        viewModel.setProperty("/AvaiableVolume", data.NewAvaiableVolume ?? 0);

        const fmt = (v: number) =>
          Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

        if (data.Changed) {
          MessageBox.information(
            `Saldo recalculado.\n\n` +
            `Alocado: ${fmt(data.PreviousAllocatedVolume)} → ${fmt(data.NewAllocatedVolume)}\n` +
            `Disponível: ${fmt(data.PreviousAvaiableVolume)} → ${fmt(data.NewAvaiableVolume)}`
          );
        } else {
          MessageToast.show("Saldo já estava correto.");
        }

        oContext.refresh();
      },
      error: err => {
        this.setBusy(false);
        const message = (err.responseJSON as { error?: { message?: string } })?.error?.message;
        MessageBox.error(message ?? "Erro ao recalcular o saldo.");
      },
    })
    .done(() => this.setBusy(false));
  }

}
