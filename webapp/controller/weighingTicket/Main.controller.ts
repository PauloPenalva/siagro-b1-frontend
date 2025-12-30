import SearchField, { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import formatter from "siagrob1/model/formatter";
import Dialog from "sap/m/Dialog";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageToast from "sap/m/MessageToast";
import IconTabBar, { IconTabBar$SelectEvent } from "sap/m/IconTabBar";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * @namespace siagrob1.controller.weighingTicket
 */
export default class Main extends BaseController {
    
  formatter = { ...formatter }

  private oDialog: Dialog;

	onInit(): void | undefined {
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

  async openFirstWeighing() {
    await this.openWeighingDialog("FW");
  }

  async openSecondWeighing() {
    await this.openWeighingDialog("SW");
  }

  async openWeighingDialog(sOperation: "FW" | "SW") {
    const oTable = this.byId("tableWeighTickets") as Table;
    const oContext = this.getSelectRowContext(oTable);
    if (!oContext) {
      MessageBox.warning("Selecione um ticket.")
      return;
    }

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/firstWeighValueVisible", sOperation === "FW" );
    uiModel.setProperty("/secondWeighValueVisible", sOperation === "SW"  );

    const viewModel = this.getModel("viewModel") as JSONModel;
    viewModel.setProperty("/FirstWeighValue", 0);
    viewModel.setProperty("/SecondWeighValue", 0);
      
    this.oDialog ??= await this.loadFragment({
      name: "siagrob1.view.weighingTicket.fragments.Weighing",
      id: this.createId("fragWeighingDlg")  ,
      addToDependents: true,
    }) as Dialog;

    this.oDialog.setBindingContext(oContext);
    this.oDialog.open();
  }


  onCloseDlg() {
    if (this.oDialog instanceof Dialog) {
      this.oDialog.close();
    }
  }

  async onSaveFirstWeighValue() {
    if (!await DialogHelper.confirmDialog("Confirma Primeira Pesagem ?")){
      return;
    }

    const oContext = this.oDialog.getBindingContext();
    const oModel = this.getModel() as ODataModel;
    const viewModel = this.getModel("viewModel") as JSONModel;
    
    const action = oModel.bindContext("/WeighingTicketsFirstWeighing(...)")
    action.setParameter("Key", oContext.getProperty("Key"));
    action.setParameter("Value", +viewModel.getProperty("/FirstWeighValue") )

    this.setBusy(true);
    void action.invoke()
      .then(() => {
        	MessageToast.show("Dados salvos com sucesso.", {
					closeOnBrowserNavigation: false
				});
        this.onCloseDlg();
        this.onRefresh();
      })
      .finally(() => this.setBusy(false));
  }

  async onSaveSecondWeighValue() {
   if (!await DialogHelper.confirmDialog("Confirma Segunda Pesagem ?")){
      return;
    }

    const oContext = this.oDialog.getBindingContext();
    const oModel = this.getModel() as ODataModel;
    const viewModel = this.getModel("viewModel") as JSONModel;
    
    const action = oModel.bindContext("/WeighingTicketsSecondWeighing(...)")
    action.setParameter("Key", oContext.getProperty("Key"));
    action.setParameter("Value", +viewModel.getProperty("/SecondWeighValue") )

    this.setBusy(true);
    void action.invoke()
      .then(() => {
        	MessageToast.show("Dados salvos com sucesso.", {
					closeOnBrowserNavigation: false
				});
        this.onCloseDlg();
        this.onRefresh();
      })
      .finally(() => this.setBusy(false));
  }

}
