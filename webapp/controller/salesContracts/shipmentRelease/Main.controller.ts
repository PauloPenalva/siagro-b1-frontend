import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { BaseController } from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";

/**
 * @namespace siagrob1.controller.salesContracts.shipmentRelease
 */
export default class Main extends BaseController {

  formatter = formatter;

  onInit(): void {
    this.createFilterModel();

    this.getRouter().getRoute("salesContractsShipmentRelease")
      .attachPatternMatched(() => this.applyFilters());
  }

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  onSearch(): void {
    this.applyFilters();
  }

  private applyFilters() {
    const oBinding = this.getView().byId("tableSalesContractsShipmentRelease").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as Record<string, string>;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      const filterKey = key;
      const value = filterData[filterKey];

      if (!value) return;

      if (filterKey == "MarketType") {
        filters.push(`${filterKey} eq '${value}'`);
      } else if (filterKey == "DeliveryEndDateFrom") {
        filters.push(`DeliveryEndDate ge ${value}`);
      } else if (filterKey == "DeliveryEndDateTo") {
        filters.push(`DeliveryEndDate le ${value}`);
      } else if (filterKey == "StandardCashFlowDateFrom") {
        filters.push(`StandardCashFlowDate ge ${value}`);
      } else if (filterKey == "StandardCashFlowDateTo") {
        filters.push(`StandardCashFlowDate le ${value}`);
      } else if (filterKey == "AgentCode") {
        // Edm.Int32: só dígitos. Number() aceitaria "1e3"/"0x10"/" " e filtraria
        // o agente errado ou zeraria a lista em vez de ignorar o valor inválido.
        if (/^\d+$/.test(value.trim())) filters.push(`AgentCode eq ${Number(value)}`);
      } else {
        filters.push(`contains(${filterKey},'${value}')`);
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    oBinding.changeParameters({
      $filter: filterParam
    });
  }

  onRequest() {
    const oTable = this.byId("tableSalesContractsShipmentRelease") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    const sId = oContext.getProperty("Key") as string;

    this.navTo("salesContractsShipmentReleaseRequest", { salesContractId: sId });
  }
}
