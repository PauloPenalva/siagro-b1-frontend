
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import Table from "sap/ui/table/Table";
import { BaseController } from "./BaseController";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";


/**
 * @namespace siagrob1.controller.purchaseContracts.allocation
 */
export default class Main extends BaseController {

  formatter = formatter;

	onInit(): void  {
    this.createFilterModel();

    this.getRouter().getRoute("purchaseOrdersAllocations")
       .attachPatternMatched(() => this.applyFilters());
	}

  onSearch(): void {
    this.applyFilters()
	}

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  private applyFilters() {
    const oBinding = this.getView().byId("tablePurchaseContractsAllocations").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as any;
    const filters: string[] = [];
    
    Object.keys(filterData).forEach((key: string) => {
      const filterKey = key;
      const value = filterData[filterKey];

      if (!value) return;

      if (filterKey == "TransactionStatus" || filterKey == "TransactionType" || filterKey == "MarketType") {
        filters.push(`${filterKey} eq '${value}'`)
      } else if (filterKey == "PurchaseContractBranchCode") {
        filters.push(`contains(PurchaseContract/BranchCode, '${value}')`)
      } else if (filterKey == "PurchaseContractCode") {
        filters.push(`contains(PurchaseContract/Code, '${value}')`)
      } else if (filterKey == "PurchaseContractCardCode") {
        filters.push(`contains(PurchaseContract/CardCode, '${value}')`)
      } else if (filterKey == "PurchaseContractItemCode") {
        filters.push(`contains(PurchaseContract/ItemCode, '${value}')`)
      } else if (filterKey == "StorageTransactionBranchCode") {
        filters.push(`contains(StorageTransaction/BranchCode, '${value}')`)
      } else if (filterKey == "StorageTransactionCode") {
        filters.push(`contains(StorageTransaction/Code, '${value}')`)
      } else if (filterKey == "WarehouseCode") {
        filters.push(`contains(StorageTransaction/WarehouseCode, '${value}')`)
      } else if (filterKey == "TruckCode") {
        filters.push(`contains(StorageTransaction/TruckCode, '${value}')`)
      } else if (filterKey == "InvoiceNumber") {
        filters.push(`contains(StorageTransaction/InvoiceNumber, '${value}')`)
      } else if (filterKey == "DateFrom") {
        filters.push(`StorageTransaction/TransactionDate ge ${value}`)
      } else if (filterKey == "DateTo") {
        filters.push(`StorageTransaction/TransactionDate le ${value}`)
      } else {
        filters.push(`contains(${filterKey},'${value}')`)
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;
  
    oBinding.changeParameters({
      $filter: filterParam
    });
  }

  async onDelete() {
    const table = this.byId("tablePurchaseContractsAllocations") as Table;
    const context = table.getContextByIndex(table.getSelectedIndex()) as Context;

    if (!context) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    if (await DialogHelper.confirmDialog("Estornar entrega de contrato ?")) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext(this.api.purchaseContractsAllocationsDelete);
      action.setParameter("Key", context.getProperty("Key"));

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Entrega estornada com sucesso.");
          this.refreshData();
        })
        .finally(() => this.setBusy(false));
    }

  }

  private refreshData() {
    const oTable = this.byId("tablePurchaseContractsAllocations") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 
}
