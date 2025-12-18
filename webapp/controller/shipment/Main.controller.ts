
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
 * @namespace siagrob1.controller.shipment
 */
export default class Main extends BaseController {

	onInit(): void  {
    this.createFilterModel();
    const jsonModel = new JSONModel();
		this.getView().setModel(jsonModel, "balance");

		this.getRouter()
			.getRoute("shipments")
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

	filter(ev: SearchField$SearchEvent) {
		const query = ev.getParameter("query");
		const filterArmazem = new Filter(
			"DeliveryLocationName",
			FilterOperator.Contains,
			query
		);
		//const filterVariedade = new Filter(
		//	"descricaoVariedade",
		//	FilterOperator.Contains,
		//	query
		//);

		const filter = new Filter({
			//filters: [filterArmazem, filterVariedade],
			filters: [filterArmazem],
			and: false,
		})

		const table = this.byId("table") as List;
		(table.getBinding("items") as ODataListBinding).filter([filter]);
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
		const oTable = this.byId("table") as List;
		const oContext = oTable.getSelectedItem()?.getBindingContext("balance");
    console.log(oContext);
    
    if (!oContext) {
      MessageBox.warning("Selecione um item na tabela.");
      return;
    }

		const itemCode = oContext.getProperty("ItemCode") as string;
		const warehouseCode = oContext.getProperty("DeliveryLocationCode") as string;
		
		this.navTo("selectStorageTransaction", {
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
