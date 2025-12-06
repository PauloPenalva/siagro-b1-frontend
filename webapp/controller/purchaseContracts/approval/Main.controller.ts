
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import { IconTabBar$SelectEvent } from "sap/m/IconTabBar";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import CommonController from "siagrob1/controller/common/CommonController";

type FilterData = {
  Code?: string,
  CardCode?: string,
  ItemCode?: string,
  Status?: string,
  Type?:string,
  DocTypeCode?: string,
  Complement?: string,
  MarketType?: string,
}

/**
 * @namespace siagrob1.controller.purchaseContracts.approval
 */
export default class Main extends CommonController {

  onInit(): void  {
    //this.createFilterModel();

    this.getRouter().getRoute("purchaseContractsApproval")
      .attachPatternMatched(() => this.onRefresh());
	}

  onClearFilters() {
    //this.clearFilters();
    //this.applyFilters();
  }

	onSearch(): void {
    //this.applyFilters()
	}

  private applyFilters() {
      const oBinding = this.getView().byId("purchaseContractsApprovalTable").getBinding("items") as ODataListBinding;
      const filterModel = this.getModel("filter") as JSONModel;
      const filterData = filterModel.getData() as FilterData;
      const filters: string[] = [];
  
      Object.keys(filterData).forEach((key: string) => {
        const filterKey = key as keyof FilterData;
        const value = filterData[filterKey];
  
        if (!value) return;
  
        if (filterKey == "Status" || filterKey == "Type" || filterKey == "MarketType") {
          filters.push(`${filterKey} eq '${value}'`)
        } else {
          filters.push(`contains(${filterKey},'${value}')`)
        }
      });
  
      const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;
  
      oBinding.changeParameters({
        $filter: filterParam
      });
    }
  
    
  onRefresh() {
    const list = this.byId("purchaseContractsApprovalTable");
    const binding = list?.getBinding("items") as ODataListBinding;

    binding?.refresh();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigateToDetail(ev: any) {
    const context = ev.getSource()?.getBindingContext() as Context;
    const id = context?.getProperty("Key") as string;
   
    if (id) {
      this.navTo("purchaseContractsApprovalDetail",{ id })
    }
  }

  onFilterSelect(ev: IconTabBar$SelectEvent) {
    const filters: string[] = [];
    const key = ev.getParameter("key")
    
    if (key) {
      filters.push(`Status eq '${key}'`)
    }
    
    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    const list = this.byId("purchaseContractsApprovalTable");
    const binding = list?.getBinding("items") as ODataListBinding;
    
    binding.changeParameters({
      $filter: filterParam
    });
  }
}
