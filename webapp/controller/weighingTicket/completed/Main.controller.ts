import { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import Dialog from "sap/m/Dialog";
import IconTabBar from "sap/m/IconTabBar";
import formatter from "siagrob1/model/formatter";

/**
 * @namespace siagrob1.controller.weighingTicket.completed
 */
export default class Main extends BaseController {
    
  formatter = formatter;
  
	onInit(): void | undefined {
		this.getRouter().getRoute("weighingTicketsCompleted")
    .attachPatternMatched(() => this.onFilterSelect())
	}

  onFilterSelect(){
      // const searchField = this.byId('weighingTicketsSearch') as SearchField;
      // const value = searchField.getValue();
  
      // searchField.fireSearch({
      //   query: value,
      // });
  
    }
  
  onSearch(ev: SearchField$SearchEvent): void {
    const query = ev?.getParameter("query");
    const table = this.byId("tableWeighTickets") as Table;
    const binding = table.getBinding("items") as ODataListBinding;
    const tab = this.byId("weighingTicketsIconTabBar") as IconTabBar;
    const filterKey = tab.getSelectedKey();

    let statusFilter;
    
    switch (filterKey) {
      case "SecondWeighing":
          statusFilter = "Stage eq 'ReadyForSecondWeighing'";
          break;
      case "WarehouseMovement":
          statusFilter = "Stage eq 'ReadyForCompleting'";
          break;
      default:
          statusFilter = "Stage eq 'ReadyForFirstWeighing'";
          break;
    }

    let filterString = statusFilter;

    // Adicionar filtros de busca se houver query
    if (query && query.trim()) {
        const searchQuery = query.trim();
        const searchFilter = `(${[
            `contains(ItemCode,'${searchQuery}')`,
            `contains(CardCode,'${searchQuery}')`,
            `contains(TruckCode,'${searchQuery}')`,
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

	onRefresh() {
      const list = this.byId("tableWeighTickets");
      const binding = list?.getBinding("items") as ODataListBinding;
  
      binding?.refresh();
    }
}
