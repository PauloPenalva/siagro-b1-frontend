import Dialog from "sap/m/Dialog";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.shipmentBilling
 */
export default class Main extends BaseController {

  formatter = formatter;

  private purchaseContractsAvaiableDialog: Dialog;

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

 
  private refreshData() {
    const oTable = this.byId("shipmentBillingTable") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 

}
