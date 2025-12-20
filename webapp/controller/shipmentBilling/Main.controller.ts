import Dialog from "sap/m/Dialog";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Fragment from "sap/ui/core/Fragment";
import Input from "sap/m/Input";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageToast from "sap/m/MessageToast";

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
  private _busyDialog: Dialog;

  onInit(): void {
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
    }
    this.setBusy(false);
  }

  async openBillingDialog() {
    await this.createBillingDialog();

    const table = this.byId("shipmentBillingTable") as Table;
    const contractsTable = this.byId("shipmentBillingSalesContractsTable") as Table;
    const contractsBinding = contractsTable.getBinding("rows") as ODataListBinding;
    const itemsSelected = table.getSelectedIndices();

    if (itemsSelected.length < 1) {
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
      TruckCode: transactions[0]?.TruckCode,
      FreightTerms: "Cif"
    });

    contractsBinding.filter([
      new Filter("ItemCode", FilterOperator.EQ, transactions[0]?.ItemCode)
    ]);

    contractsBinding.refresh();
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

  async saveBillingDialog() {
    if (!this.validateForm("shipmentBillingSalesContractsForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    const shipments: any[] = [];
    const shipmentBillingTable = this.byId("shipmentBillingTable") as Table;
    const selectedShipments = shipmentBillingTable.getSelectedIndices();

    selectedShipments.forEach(i => {
      const shipmentCtx = shipmentBillingTable.getContextByIndex(i);
      const shipmentObj: any = shipmentCtx.getObject();

      shipments.push({
        Key: shipmentObj?.Key
      });
    });


    const contractsTable = this.byId("shipmentBillingSalesContractsTable") as Table;
    const selectedContract = contractsTable.getSelectedIndices();
    if (selectedContract.length < 1) {
      MessageBox.error("Contrato não selecionado.");
      throw new Error("Contrato não selecionado.");
    }

    const contractCtx = contractsTable.getContextByIndex(selectedContract[0]) as Context;

    if (contractCtx) {
      const model = this.getModel() as ODataModel;
      const viewModel = this.getModel("viewModel") as JSONModel;
      const contract = contractCtx.getObject();
      const billing = viewModel.getData();

      const confirm = await DialogHelper.confirmDialog("Confirma emissão do(s) Documento(s) de Saída ?");
      if (confirm) {

        const salesInvoice: any = {
          CardCode: contract?.CardCode,
          GrossWeight: +billing?.Volume,
          NetWeight: +billing?.Volume,
          TruckingCompanyCode: billing?.TruckingCompanyCode,
          TruckCode: billing?.TruckCode,
          TaxPayerComments: billing?.TaxPayerComments,
          DeliveryCardCode: billing?.DeliveryCardCode,
          Items: [
            {
              ItemCode: billing?.ItemCode,
              Quantity: +billing?.Volume,
              UnitPrice: +contract?.Price,
              UnitOfMeasureCode: contract?.UnitOfMeasureCode,
              SalesContractKey: contract?.Key
            }
          ],
          SalesTransactions: shipments
        };
 
        this.closeBillingDialog();

        await this.createBusyDialog();
        this._busyDialog?.open();

        const action = model.bindContext("/ShipmentBillingCreateSalesInvoice(...)");
        action.setParameter("SalesInvoice", salesInvoice)
        void action.invoke()
          .then(() => {
            MessageToast.show("Documento(s) de saída criado(s) com sucesso.");
            this.refreshData();
          })
          .finally(() => this._busyDialog?.close());
      }
    }
  }

  closeBillingDialog() {
    const oTable = this.byId("shipmentBillingTable") as Table;
    const oTableContracts = this.byId("shipmentBillingSalesContractsTable") as Table;
    oTable.clearSelection();
    oTableContracts.clearSelection();

    this._billingDialog.close();
  }

  private refreshData() {
    const oTable = this.byId("shipmentBillingTable") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }

  private async createBusyDialog() {
		if (!this._busyDialog) {
			this._busyDialog = await Fragment.load({
				name: "siagrob1.view.shipmentBilling.fragments.BusyDialog",
				controller: this,
			}) as unknown as Dialog;
			this.getView().addDependent(this._busyDialog);
		}
	}

}
