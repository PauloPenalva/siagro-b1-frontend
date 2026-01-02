import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace siagrob1.controller.weighingTicket.completed
 */
export default class Main extends BaseController {
    
  formatter = formatter;
  
	onInit() {
    this.createFilterModel();

		this.getRouter().getRoute("weighingTicketsCompleted")
    .attachPatternMatched(() => this.applyFilters())
	}

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  onSearch(): void {
    this.applyFilters()
	}


  private applyFilters() {
      const oBinding = this.getView().byId("tableWeighingTicketsCompleted").getBinding("rows") as ODataListBinding;
      const filterModel = this.getModel("filter") as JSONModel;
      const filterData = filterModel.getData() as any;
      const filters: string[] = [];
  
      Object.keys(filterData).forEach((key: string) => {
        const value = filterData[key];
  
        if (!value) return;
  
        if (key == "Type") {
          filters.push(`${key} eq '${value}'`)
        } else if (key == "DateFrom") {
          filters.push(`Date ge ${value}`)
        } else if (key == "DateTo") {
          filters.push(`Date le ${value}`)
        } else {
          filters.push(`contains(${key},'${value}')`)
        }
      });
  
      const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;
  
      console.log(filterParam);
      
      oBinding.changeParameters({
        $filter: filterParam
      });
    }
  

	onRefresh() {
      const list = this.byId("tableWeighingTicketsCompleted");
      const binding = list?.getBinding("rows") as ODataListBinding;
  
      binding?.refresh();
    }
}
