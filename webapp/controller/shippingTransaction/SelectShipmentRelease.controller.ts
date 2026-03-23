

import { BaseController } from "./BaseController";

import List from 'sap/m/List';
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

type routeArgs = {
  "?query": { 
    itemCode: string ,
    warehouseCode: string,
  }
}

/**
 * @namespace siagrob1.controller.shippingTransaction
 */
export default class SelectShipmentRelease extends BaseController {

  private _itemCode: string;
  
	onInit(): void  {

    const jsonModel = new JSONModel();
    this.getView().setModel(jsonModel, "contracts");

    this.getRouter()
			.getRoute("selectShipmentRelease")
			.attachPatternMatched((ev) => this.onRouteMatched(ev), this);
	}

  private onRouteMatched(ev: Route$PatternMatchedEvent) {
    const args = ev.getParameter("arguments") as routeArgs;
    
    const query = args["?query"];
    
		if (query) {
      const itemCode = query?.itemCode;
      const warehouseCode = query?.warehouseCode;
      
      this._itemCode = itemCode;
      
      if (itemCode) {
        this.getPurchaseContracts(itemCode, warehouseCode)	
      }

      return;
    }
	}

  onCreateShippingTransaction() {
    const oTable = this.byId("tableSelectShipmentRelease") as List;
		const oContext = oTable.getSelectedItem()?.getBindingContext("contracts");
    
    if (!oContext) {
      MessageBox.warning("Selecione um item na tabela.");
      return;
    }

		const key = oContext.getProperty("ShipmentReleaseKey") as string;

    this.navTo("shippingTransactionCreate",{
        "?query":{ shipmentReleaseKey: key }
    })
  }

  onCancel() {
    if (this._itemCode) {
      this.navTo("shippingTransaction",{
        "?query":{ itemCode: this._itemCode }
      })
      return;
    }

    this.onNavBack();
  }

  private async getPurchaseContracts(itemCode: string, warehouseCode: string) {
      const model = this.getModel() as ODataModel;
      const func = model.bindContext("/ShipmentReleasesGetPurchaseContracts(...)");
      func.setParameter("ItemCode", itemCode);
      func.setParameter("WarehouseCode", warehouseCode);
  
      this.setBusy(true);
      
      await func.invoke();
      const resultContext = func.getBoundContext();
      const viewModel = this.getModel("contracts") as JSONModel
      viewModel.setData(resultContext.getObject() as object);
  
      this.setBusy(false);   
    }
}
