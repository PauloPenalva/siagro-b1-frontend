
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";

import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";

import List from 'sap/m/List';
import { SearchField$SearchEvent } from 'sap/m/SearchField';
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";

type routeArgs = {
  "?query": { 
    itemCode: string 
  }
}

/**
 * @namespace siagrob1.controller.shippingTransaction
 */
export default class Main extends BaseController {

	onInit(): void  {
    this.createFilterModel();
    const jsonModel = new JSONModel();
		this.getView().setModel(jsonModel, "balance");

		this.getRouter()
			.getRoute("shippingTransaction")
			.attachPatternMatched((ev) => this.onRouteMatched(ev), this);
	}

  private onRouteMatched(ev: Route$PatternMatchedEvent) {
    const args = ev.getParameter("arguments") as routeArgs;
    
    const query = args["?query"];
		if (query) {
      const key = query?.itemCode;
      const filterModel = this.getModel("filter") as JSONModel;
      filterModel.setData({ItemCode: key});
      
      if (key) {
        this.getSaldosEstoque(key)	
      }

      return;
    }

    const viewModel = this.getModel("balance") as JSONModel
    viewModel.setData([]);
	}

	onFilter(ev: SearchField$SearchEvent) {
		const query = ev.getParameter("query");
    const table = this.byId("table") as List;
    const bindingList = table.getBinding("items") as ODataListBinding
		
		const filter = new Filter({
			filters: [
        new Filter("DeliveryLocationName", FilterOperator.Contains, query)
      ],
			and: false,
		})

		bindingList.filter([filter]);
	}

	async onSearch() {
  
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as { ItemCode: string };

    Object.keys(filterData).forEach((key: string) => {
      const filterKey = key as keyof { ItemCode: string };
      const value = filterData[filterKey];

      if (!value) return;

      this.getSaldosEstoque(value);
    });
	}

	selectShipmentRelease() {
		const oTable = this.byId("tableShipmentReleasesBalance") as List;
		const oContext = oTable.getSelectedItem()?.getBindingContext("balance");
    
    if (!oContext) {
      MessageBox.warning("Selecione um item na tabela.");
      return;
    }

		const itemCode = oContext.getProperty("ItemCode") as string;
		const warehouseCode = oContext.getProperty("DeliveryLocationCode") as string;
		
		this.navTo("selectShipmentRelease", {
      "?query": {
        itemCode,
        warehouseCode,
      }
    })
	}

	private async getSaldosEstoque(key: string) {
    const model = this.getModel() as ODataModel;
    const func = model.bindContext("/ShipmentReleasesGetBalance(...)");
    func.setParameter("ItemCode", key);

    this.setBusy(true);
    
    await func.invoke();
    const resultContext = func.getBoundContext();
    const viewModel = this.getModel("balance") as JSONModel
    viewModel.setData(resultContext.getObject() as object);

    this.setBusy(false);   
	}
 
}
