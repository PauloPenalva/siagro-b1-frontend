import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";

/**
 * @namespace siagrob1.controller.purchaseContracts.allocation
 */
export default class Main extends CommonController {

  formatter = formatter;

  private purchaseContractsAvaiableDialog: Dialog;

	onInit(): void  {
    this.getRouter().getRoute("purchaseContractsAllocations")
       .attachPatternMatched(() => this.applyFilters());
	}

  async onAlocate() {
    const table = this.byId("storageTransactionsAllocationTable") as Table;
    const context = table.getContextByIndex(table.getSelectedIndex()) as Context;
    
    if (context) {
      this.purchaseContractsAvaiableDialog ??= 
        await DialogHelper.createDialog(this, "siagrob1.view.purchaseContracts.allocation.fragments.PurchaseContractsAvaiables");
      
      this.purchaseContractsAvaiableDialog.setBindingContext(context);
      this.purchaseContractsAvaiableDialog.open();
      
      const model = this.getModel() as ODataModel;
      const func = model.bindContext("/PurchaseContractsGetAvaiablesList(...)");
      func.setParameter("CardCode", context.getProperty("CardCode"));
      func.setParameter("ItemCode", context.getProperty("ItemCode"));

      this.setBusy(true);
      void func.invoke()
        .then(() => {
          const resultContext = func.getBoundContext();
          const viewModel = this.getModel("viewModel") as JSONModel
          viewModel.setData(resultContext.getObject() as object);
        
        })
        .finally(() => this.setBusy(false))
          
      return;
    }

    MessageBox.warning("Selecione um registro.")
  }

  onCloseDialog() {
    const viewModel = this.getModel("viewModel") as JSONModel;
    viewModel.setData([]);

    this.purchaseContractsAvaiableDialog?.close();
  }

  async onConfirmDialog() {
    const dlgId = this.getView().getId() + "_siagrob1.view.purchaseContracts.allocation.fragments.PurchaseContractsAvaiables";

    const dlgTable = sap.ui.core.Fragment.byId(dlgId,"purchaseContractsAvaiableTable") as Table;
    const selected = dlgTable.getSelectedIndices();
    if (selected.length == 0 || selected.length > 1) {
      MessageBox.warning("Selecione um item na lista.");
      return;
    }
    
    const context = this.purchaseContractsAvaiableDialog.getBindingContext() as Context;
    const tableCtx = dlgTable.getContextByIndex(selected[0]);

    if (tableCtx) {
      const storageTransactionKey = context.getProperty("Key") as string;
      const avaiableVolumeToAlloc = +context.getProperty("AvaiableVolumeToAllocate");
      const avaiableVolume = +tableCtx.getProperty("AvaiableVolume");
      const purchaseContractKey = tableCtx.getProperty("Key") as string;
      const volume = +tableCtx.getProperty("Volume");
      
      if (!volume || +volume <=0){
        MessageBox.warning("Informe o volume a alocar no contrato.");
        return;
      }

      if (volume > avaiableVolumeToAlloc) {
        MessageBox.warning(`O volume informado é superior ao saldo disponivel do romaneio (${this.formatter.formatDecimal(avaiableVolumeToAlloc, 3)}).`)
        return;
      }

       if (volume > avaiableVolume) {
        MessageBox.warning(`O volume informado é superior ao saldo disponivel do contrato (${this.formatter.formatDecimal(avaiableVolume, 3)}).`)
        return;
      }

      const confirm = await DialogHelper.confirmDialog("Confirma alocação do romaneio ?");
      if (confirm) {
        this.purchaseContractsAvaiableDialog?.close();
        
        const action = (this.getModel() as ODataModel).bindContext("/PurchaseContractsCreateAllocation(...)");
        action.setParameter("PurchaseContractKey", purchaseContractKey);
        action.setParameter("StorageTransactionKey", storageTransactionKey);
        action.setParameter("Volume", volume);

        this.setBusy(true);
        void action.invoke()
          .then(() => {
            this.refreshData();
            MessageToast.show(`Romaneio ${context.getProperty("Code")} aplicado com sucesso ao contrato ${tableCtx.getProperty("Code")}.`)
          })
          .finally(() => { 
            this.setBusy(false);
          });
      }

      return;
    }
  }

  private applyFilters() {
    const oBinding = this.getView().byId("storageTransactionsAllocationTable").getBinding("rows") as ODataListBinding;
    const filters: string[] = [];
    
    const typesFilter = `(${[
            `TransactionType eq 'Purchase'`,
            `TransactionType eq 'PurchaseReturn'`,
            `TransactionType eq 'PurchaseQtyComplement'`,
            `TransactionType eq 'PurchasePriceComplement'`
        ].join(' or ')})`;
    
    filters.push("TransactionStatus eq 'Confirmed'");
    filters.push("AvaiableVolumeToAllocate gt 0");

    const filter = filters.join(' and ');

    // Object.keys(filterData).forEach((key: string) => {
    //   const filterKey = key as keyof FilterData;
    //   const value = filterData[filterKey];

    //   if (!value) return;

    //   if (filterKey == "Status" || filterKey == "Type" || filterKey == "MarketType") {
    //     filters.push(`${filterKey} eq '${value}'`)
    //   } else {
    //     filters.push(`contains(${filterKey},'${value}')`)
    //   }
    // });

    //const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    const filterParam = `${filter} and ${typesFilter}`

		oBinding.changeParameters({
      $filter: filterParam
    });
  }

 
  private refreshData() {
    const oTable = this.byId("storageTransactionsAllocationTable") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 

}
