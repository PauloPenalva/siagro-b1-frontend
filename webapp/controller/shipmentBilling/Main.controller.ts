import Dialog from "sap/m/Dialog";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Fragment from "sap/ui/core/Fragment";
import Input from "sap/m/Input";

type BillingData = {
  ItemCode: string,
  ItemName: string,
  TruckDriverCode: string,
  TruckCode: string,
}

/**
 * @namespace siagrob1.controller.shipmentBilling
 */
export default class Main extends BaseController {

  formatter = formatter;

  private _billingDialog: Dialog;

	onInit(): void  {
    this.getRouter().getRoute("shipmentBilling")
       .attachPatternMatched(() => this.applyFilters());
	}

 
  private applyFilters() {
    const oBinding = this.getView().byId("shipmentBillingTable").getBinding("rows") as ODataListBinding;
    const filters: string[] = [];
    
    const typesFilter = `(${[
            `TransactionType eq 'SalesShipment'`,
            //`TransactionType eq 'SalesShipmentReturn'`,
        ].join(' or ')})`;
    
    filters.push("TransactionStatus eq 'Confirmed'");
    //filters.push("AvaiableVolumeToAllocate gt 0");

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

  private async createBillingDialog() {
    const name = "siagrob1.view.shipmentBilling.fragments.Billing";
		const oView = this.getView();
		this._billingDialog = this.byId("billingDialog") as Dialog;

		if (!this._billingDialog) {
			this.setBusy(true);
			this._billingDialog = await Fragment.load({
				id: oView.getId(),
				name,
				controller: this
		  }) as unknown as Dialog;
			oView.addDependent(this._billingDialog);

			const inputGrossWeightLimit = this.byId("grossWeightLimit") as Input;
			inputGrossWeightLimit.attachBrowserEvent("focusin", function () {
				inputGrossWeightLimit.selectText(0, inputGrossWeightLimit.getValue().length);
			});
		}
		this.setBusy(false);
	}

  async openBillingDialog() {
    await this.createBillingDialog();

    const table = this.byId("shipmentBillingTable") as Table;
    const contractsTable = this.byId("shipmentBillingSalesContractsTable") as Table;
    const contractsBinding = contractsTable.getBinding("rows") as ODataListBinding;
    const itemsSelected = table.getSelectedIndices();

    if (itemsSelected.length < 1){
      MessageBox.warning("Selecione ao menos 1 item para faturamento.");
      throw new Error("Selecione ao menos 1 item para faturamento.");
    }

    if (this.hasTruckCodeInconsistency(itemsSelected)) {
			MessageBox.warning("Placas diferentes selecionadas.");
			return;
		}

		if (this.hasItemCodeInconsistency(itemsSelected)) {
			MessageBox.warning("Produtos diferentes selecionados.");
			return;
		}

    const viewModel = this.getModel("viewModel") as JSONModel;
    const transactions: BillingData[] = [];
    let totalVolume = 0;

    itemsSelected.forEach(i => {
      const ctx = table.getContextByIndex(i) as Context;
      totalVolume += +ctx.getProperty("GrossWeight");
      transactions.push(ctx.getObject());
    })

    viewModel.setData({
      ItemCode: transactions[0]?.ItemCode,
      ItemName: transactions[0]?.ItemName,
      Volume: totalVolume,
      GrossWeightLimit: 0,
      TruckDriverCode: transactions[0]?.TruckDriverCode,
      TruckCode: transactions[0]?.TruckCode
    });
    
    contractsBinding.filter([
      new Filter("ItemCode", FilterOperator.EQ, transactions[0]?.ItemCode)
    ]);

    this._billingDialog?.open();
  }

  private hasTruckCodeInconsistency(itemsSelected: number[]): boolean {
		const table = this.byId("shipmentBillingTable") as Table;

		const truckCodes: string[] = itemsSelected.map((i) => {
			const ctx = table.getContextByIndex(i);
			return ctx.getProperty("TruckCode") as string;
		});

		for (let i = 1; i < truckCodes.length; i++) {
			if (truckCodes[i] !== truckCodes[0]) {
				return true;
			}
		}

		return false;
	}

  private hasItemCodeInconsistency(itemsSelected: number[]): boolean {
		const table = this.byId("shipmentBillingTable") as Table;

		const itemCodes: string[] = itemsSelected.map((i) => {
			const ctx = table.getContextByIndex(i);
			return ctx.getProperty("ItemCode") as string;
		});

		for (let i = 1; i < itemCodes.length; i++) {
			if (itemCodes[i] !== itemCodes[0]) {
				return true;
			}
		}

		return false;
	}

  closeBillingDialog() {
    this._billingDialog?.close();
  }
 
  private refreshData() {
    const oTable = this.byId("shipmentBillingTable") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 

}
