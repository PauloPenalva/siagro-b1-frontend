import SearchField, { SearchField$SearchEvent } from "sap/m/SearchField";
// A lista só navega para as telas de pesagem; a captura de peso acontece lá, não aqui.
import GenericController from "./GenericController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import formatter from "siagrob1/model/formatter";
import IconTabBar from "sap/m/IconTabBar";
import { ListBase$ItemPressEvent } from "sap/m/ListBase";

/**
 * @namespace siagrob1.controller.weighingTicket
 */
export default class Main extends GenericController {
    
  formatter = { ...formatter }

	onInit(): void {
		this.getRouter().getRoute("weighingTickets")
    .attachPatternMatched(() => this.onFilterSelect())
	}

  onFilterSelect(){
      const searchField = this.byId('weighingTicketsSearch') as SearchField;
      const value = searchField.getValue();
  
      searchField.fireSearch({
        query: value,
      });
  
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

	onCreate() {
			this.navTo("weighingTicketsNew");
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableWeighTickets") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0){
      	MessageBox.alert("Selecione um item para deletar.");
      return;
    }

		const oBindingContext = oTable.getContextByIndex(i) as Context;

		if (await confirmDialog("Deseja realmente deletar este registro ?", "Deletar registro ?")) {
			try{
				this.setBusy(true)
	
				await oBindingContext.delete("$auto");
	
				await oModel.submitBatch(oModel.getUpdateGroupId())
					
				if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
					MessageBox.information("Registro deletado.")
				}
			} finally {
				this.setBusy(false)
			}
		}

	}

  onEdit(ev: ListBase$ItemPressEvent) {
    const tab = this.byId("weighingTicketsIconTabBar") as IconTabBar  
    const context = ev.getSource()?.getBindingContext() as Context;
    const id = context?.getProperty("Key") as string;
    
    const tabSelected = tab.getSelectedKey();

    let route: string;

    switch (tabSelected) {
      case "FirstWeighing":
        route = "weighingTicketsFirstWeighing";
        break;
      case "SecondWeighing":
        route = "weighingTicketsSecondWeighing";
        break;
      case "WarehouseMovement":
        route = "weighingTicketsConfirm";
        break;
      default:
        break;
    }

    if (id) {
      this.navTo(route,{ id })
    }
  }
    
}
