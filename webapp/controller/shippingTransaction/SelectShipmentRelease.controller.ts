
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";

import { BaseController } from "./BaseController";

import List from 'sap/m/List';
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';
import MessageBox from "sap/m/MessageBox";

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

		const table = this.byId("tableSelectShipmentRelease") as List;
    const bindingItems = table.getBinding("items") as ODataListBinding;

		bindingItems.filter([filter]);
	}

  onCreateShippingTransaction() {
    const oTable = this.byId("tableSelectShipmentRelease") as List;
		const oContext = oTable.getSelectedItem()?.getBindingContext();
    
    if (!oContext) {
      MessageBox.warning("Selecione um item na tabela.");
      return;
    }

		const key = oContext.getProperty("Key") as string;

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
}
