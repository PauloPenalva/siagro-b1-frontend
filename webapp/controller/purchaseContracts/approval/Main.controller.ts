
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import CommonController from "siagrob1/controller/common/CommonController";
import SearchField, { SearchField$SearchEvent } from "sap/m/SearchField";
import Table from "sap/m/Table";
import IconTabBar from "sap/m/IconTabBar";
import { ListBase$ItemPressEvent } from "sap/m/ListBase";


/**
 * @namespace siagrob1.controller.purchaseContracts.approval
 */
export default class Main extends CommonController {

  onInit(): void  {
    
    this.getRouter().getRoute("purchaseContractsApproval")
      .attachPatternMatched(() => this.onFilterSelect());
	}

	onSearch(ev: SearchField$SearchEvent): void {
    const query = ev?.getParameter("query");
    const table = this.byId("purchaseContractsApprovalTable") as Table;
    const binding = table.getBinding("items") as ODataListBinding;
    const tab = this.byId("purchaseContractsApprovalIconTabBar") as IconTabBar;
    const filterKey = tab.getSelectedKey();

    let statusFilter;
    
    switch (filterKey) {
      case "Approved":
          statusFilter = "Status eq 'Approved'";
          break;
      case "Rejected":
          statusFilter = "Status eq 'Rejected'";
          break;
      case "Canceled":
          statusFilter = "Status eq 'Canceled'";
          break;
      default:
          statusFilter = "Status eq 'InApproval'";
          break;
    }

    let filterString = statusFilter;

    // Adicionar filtros de busca se houver query
    if (query && query.trim()) {
        const searchQuery = query.trim();
        const searchFilter = `(${[
            `contains(CardName,'${searchQuery}')`,
            `contains(ItemName,'${searchQuery}')`,
            `contains(ItemCode,'${searchQuery}')`,
            `contains(CardCode,'${searchQuery}')`,
            `contains(Code,'${searchQuery}')`
        ].join(' or ')})`;
        
        filterString = `${statusFilter} and ${searchFilter}`;
    }

    console.log("Filter string:", filterString);
    
    // IMPORTANTE: Usar changeParameters para filtro OData string
    binding.changeParameters({
        "$filter": filterString
    });
  }

  onFilterSelect(){
    const searchField = this.byId('purchaseContractsApprovalSearchField') as SearchField;
    const value = searchField.getValue();

    searchField.fireSearch({
      query: value,
    });

  }
    
  onRefresh() {
    const list = this.byId("purchaseContractsApprovalTable");
    const binding = list?.getBinding("items") as ODataListBinding;

    binding?.refresh();
  }

  onNavigateToDetail(ev: ListBase$ItemPressEvent) {
    const context = ev.getSource()?.getBindingContext() as Context;
    const id = context?.getProperty("Key") as string;
   
    if (id) {
      this.navTo("purchaseContractsApprovalDetail",{ id })
    }
  }
}
