
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";

import { BaseController } from "./BaseController";

import List from 'sap/m/List';
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';

type routeArgs = {
  "?query": { 
    itemCode: string ,
    warehouseCode: string,
  }
}

/**
 * @namespace siagrob1.controller.shipment
 */
export default class Main extends BaseController {

  private _itemCode: string;

	onInit(): void  {
    this.getRouter()
			.getRoute("selectStorageTransaction")
			.attachPatternMatched((ev) => this.onRouteMatched(ev), this);
	}

  private onRouteMatched(ev: Route$PatternMatchedEvent) {
    const args = ev.getParameter("arguments") as routeArgs;
    
    const query = args["?query"];
    
		if (query) {
      const itemCode = query?.itemCode;
      const warehouseCode = query?.warehouseCode;
      
      this._itemCode = itemCode;

      this.filter(itemCode, warehouseCode)

      return;
    }

    this.filter(null, null);
	}

	private filter(itemCode: string, warehouseCode: string) {
		const filter = new Filter({
			filters: [
        new Filter("PurchaseContract/ItemCode", FilterOperator.EQ, itemCode),
        new Filter("DeliveryLocationCode", FilterOperator.EQ, warehouseCode),
      ],
      and: true
		})

		const table = this.byId("tableSelect") as List;
    const bindingItems = table.getBinding("items") as ODataListBinding;

		bindingItems.filter([filter]);
	}

  onCancel() {
    if (this._itemCode) {
      this.navTo("shipments",{
        "?query":{ itemCode: this._itemCode }
      })
      return;
    }

    this.onNavBack();
  }
}
