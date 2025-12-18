/* eslint-disable @typescript-eslint/no-explicit-any */
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import RequestModel from "siagrob1/model/RequestModel";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import { QualityAttrib } from "siagrob1/types/QualityAttrib";
import MessageToast from "sap/m/MessageToast";

type routeArgs = {
  "?query": { 
    shipmentReleaseKey: string 
  }
}

/**
 * @namespace siagrob1.controller.shippingTransaction
 */
export default class Create extends BaseController {

	onInit(): void  {
		this.getRouter().getRoute("shippingTransactionCreate").attachPatternMatched((ev) => this.routeMatched(ev));
	}

	private async routeMatched(ev: Route$PatternMatchedEvent) {
    const args = ev.getParameter("arguments") as routeArgs;
    const query = args["?query"];

    if (query) {
      const key = query?.shipmentReleaseKey;

      const requestModel = new RequestModel();
      const shipmentServerUrl = this.api.shipmentReleases + `(${key})?$expand=PurchaseContract`

      let data;

      try {
        this.setBusy(true);
        data = await requestModel.get(shipmentServerUrl);
      } catch (error) {
        const err = error as JQueryXHR;
        MessageBox.error(err.responseJSON?.error?.message)
      } finally {
        this.setBusy(false);
      }

      const qualityAttribServerUrl = this.api.qualityAttrib + `?$orderby=Code&$filter=Disabled eq false`
      let qualityAttribs;
      try {
        this.setBusy(true);
        qualityAttribs = await requestModel.get(qualityAttribServerUrl)
      } catch (error) {
        const err = error as JQueryXHR;
        MessageBox.error(err.responseJSON?.error?.message)
      } finally {
        this.setBusy(false);
      }

      const uiModel = this.getModel("ui") as JSONModel;
      uiModel.setProperty("/editable", true);

      this.clearStates("shippingTransactionForm");

      const viewModel = this.getModel("viewModel") as JSONModel;

      viewModel.setData({
        PurchaseContractKey: data?.PurchaseContractKey,
        StorageTransaction: {
          TransactionType: "Purchase",
          CardCode: data?.PurchaseContract?.CardCode,
          ItemCode: data?.PurchaseContract?.ItemCode,
          UnitOfMeasureCode: data?.PurchaseContract?.UnitOfMeasureCode,
          WarehouseCode: data?.DeliveryLocationCode,
          ShipmentReleaseKey: key,
          QualityInspections: qualityAttribs?.value?.map((x: QualityAttrib) => { 
            return { QualityAttribCode: x.Code, Value: 0 }
          }),
       }
      });

      return;
    }
	
	}

	async onSave() {
		
    if (!this.validateForm("shippingTransactionForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getModel() as ODataModel;
    const viewModel = this.getModel("viewModel") as JSONModel;
    const viewData = viewModel.getData();

    const action = oModel.bindContext("/ShippingTransactionsCreate(...)");
    action.setParameter("StorageTransaction", viewData?.StorageTransaction);
    action.setParameter("PurchaseContractKey", viewData?.PurchaseContractKey);

		try {
			this.setBusy(true);
			await action.invoke();
      MessageToast.show("Embarque criado com sucesso.");
      this.navToShippingTransaction(viewData?.StorageTransaction?.ItemCode);
		} finally {
			this.setBusy(false);
		}
	}

	onCancel() {
    this.onNavBack();
	}

  private navToShippingTransaction(itemCode: string) {
     this.navTo("shippingTransaction",{
        "?query":{ itemCode }
      })
  }
}
