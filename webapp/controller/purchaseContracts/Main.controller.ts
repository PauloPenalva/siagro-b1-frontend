
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import BaseController from "./PurchaseContractsBaseController";
import JSONModel from "sap/ui/model/json/JSONModel";

type FilterData = {
  Code?: string,
  CardCode?: string,
  ItemCode?: string,
  Status?: string
}

/**
 * @namespace siagrob1.controller.purchaseContracts
 */
export default class Main extends BaseController {

  formatter = formatter;

	onInit(): void  {
    this.createFilterModel();

    this.getRouter().getRoute("purchaseContracts")
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
    const oBinding = this.getView().byId("tablePurchaseContracts").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as FilterData;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      if (key == "Status") {
        filters.push(`${key} eq '${filterData[key]}'`)
      } else if (key == "Code" || key == "CardCode" || key == "ItemCode") {
        filters.push(`contains(${key},'${filterData[key]}')`)
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

		oBinding.changeParameters({
      $filter: filterParam
    });
  }

  onCreate() {
		this.navTo("purchaseContractsNew");
	}

	onDetail(): void {
		const oTable = this.byId("tablePurchaseContracts") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Key") as string;
    
		this.navTo("purchaseContractsDetail", {id: sId});
	}

	async onDelete() {
		const oModel = this.getView().getModel() as ODataModel;
		const oTable = this.byId("tablePurchaseContracts") as Table;
		
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
    const oTable = this.byId("tablePurchaseContracts") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }
    
    const oBindingContext = oTable.getContextByIndex(i) as Context;
    const bConfirm = await confirmDialog("Copiar contrato ?");
    if (bConfirm) {
    
      const key = oBindingContext.getProperty("Key") as string;
      const sUrl = `${this.api.purchaseContractsCopy}`

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
    const oTable = this.byId("tablePurchaseContracts") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 
}
