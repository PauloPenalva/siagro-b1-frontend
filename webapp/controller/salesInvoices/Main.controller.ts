
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import MessageToast from "sap/m/MessageToast";
import DialogHelper from "siagrob1/dialogs/DialogHelper";


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
 * @namespace siagrob1.controller.salesInvoices
 */
export default class Main extends BaseController {

  formatter = formatter;

	onInit(): void  {
    this.createFilterModel();

    this.getRouter().getRoute("salesInvoices")
      .attachPatternMatched(() => this.applyFilters());
	}

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

	onSearch(): void {
    this.applyFilters()
	}

  private applyFilters() {
    const oBinding = this.getView().byId("tableSalesInvoices").getBinding("rows") as ODataListBinding;
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

  onCreate() {
		this.navTo("salesContractsNew");
	}

	onDetail(): void {
		const oTable = this.byId("tableSalesInvoices") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Key") as string;
    
		this.navTo("salesContractsDetail", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tableSalesInvoices") as Table;
		
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    const oBindingContext = oTable.getContextByIndex(i) as Context;
 
		if (await confirmDialog("Deseja realmente deletar este registro ?", "Deletar registro ?")) {
			try{
				this.setBusy(true)
	
				await oBindingContext.delete("$auto");
	
				await oModel.submitBatch(oModel.getUpdateGroupId())
					
				if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
					//MessageBox.information("Registro deletado.")
				}
			} finally {
				this.setBusy(false)
			}
		}

	}

  async onCopy() {
    const oTable = this.byId("tableSalesInvoices") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    
    const oBindingContext = oTable.getContextByIndex(i) as Context;
    const bConfirm = await confirmDialog("Copiar contrato ?");
    if (bConfirm) {
    
      const key = oBindingContext.getProperty("Key") as string;
      const sUrl = `${this.api.salesContractsCopy}`

      this.setBusy(true);

      void jQuery.ajax({
        url: sUrl,
        method: 'POST',
        data: JSON.stringify({Key: key}),
        contentType: 'application/json',
        success: () =>  { 
          this.setBusy(false);
          this.refreshData();
        },
        error: err => {
          this.setBusy(false);
          MessageBox.error(err.responseText);
        },
      })
      .done(() => this.setBusy(false))
    }
  }

  private refreshData() {
    const oTable = this.byId("tableSalesInvoices") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 
  async onCancel() {
    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();
    if (selectedInvoice.length == 0){
      MessageBox.warning("Selecione um registro.")
      throw new Error("Selecione um registro");
    }

    if (selectedInvoice.length > 1){
      MessageBox.warning("Selecione apenas um registro.")
      throw new Error("Selecione apenas um registro.");
    }

    if (await DialogHelper.confirmDialog("Cancelar Documento de Saída ?")) {
      const ctx = table.getContextByIndex(selectedInvoice[0]);
      const oModel = this.getModel() as ODataModel;
      const action = oModel.bindContext("/SalesInvoicesCancel(...)");
      action.setParameter("Key", ctx.getProperty("Key"));
      
      this.setBusy(true);
      void action.invoke()
        .then(() => {
          this.refreshData();
          MessageToast.show("Documento de saída cancelado com sucesso.")
        })
        .finally(() => this.setBusy(false));
    }
  }
}
