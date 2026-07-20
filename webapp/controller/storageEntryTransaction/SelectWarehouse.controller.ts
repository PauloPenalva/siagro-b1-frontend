import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";

import Table from 'sap/m/Table';
import { SearchField$SearchEvent } from 'sap/m/SearchField';
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import Filter from 'sap/ui/model/Filter';
import FilterOperator from 'sap/ui/model/FilterOperator';
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";

type routeArgs = {
  "?query": {
    itemCode: string
  }
}

/**
 * Primeiro passo da nova entrada: escolher produto e armazém de origem.
 *
 * @namespace siagrob1.controller.storageEntryTransaction
 */
export default class SelectWarehouse extends BaseController {

  onInit(): void {
    this.createFilterModel();
    this.getView().setModel(new JSONModel(), "balance");

    this.getRouter()
      .getRoute("storageEntryTransactionSelectWarehouse")
      .attachPatternMatched((ev) => this.onRouteMatched(ev), this);
  }

  private onRouteMatched(ev: Route$PatternMatchedEvent) {
    const args = ev.getParameter("arguments") as routeArgs;
    const query = args["?query"];

    if (query?.itemCode) {
      const filterModel = this.getModel("filter") as JSONModel;
      filterModel.setData({ ItemCode: query.itemCode });
      void this.getSaldosEstoque(query.itemCode);
      return;
    }

    const viewModel = this.getModel("balance") as JSONModel;
    viewModel.setData([]);
  }

  onFilter(ev: SearchField$SearchEvent) {
    const query = ev.getParameter("query");
    const table = this.byId("tableStorageEntryBalance") as Table;
    const bindingList = table.getBinding("items") as ODataListBinding;

    const filter = new Filter({
      filters: [
        new Filter("DeliveryLocationName", FilterOperator.Contains, query)
      ],
      and: false,
    });

    bindingList.filter([filter]);
  }

  onSearch() {
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as { ItemCode: string };

    if (!filterData?.ItemCode) return;

    void this.getSaldosEstoque(filterData.ItemCode);
  }

  onSelectShipmentRelease() {
    const oTable = this.byId("tableStorageEntryBalance") as Table;
    const oContext = oTable.getSelectedItem()?.getBindingContext("balance");

    if (!oContext) {
      MessageBox.warning("Selecione um item na tabela.");
      return;
    }

    const itemCode = oContext.getProperty("ItemCode") as string;
    const warehouseCode = oContext.getProperty("DeliveryLocationCode") as string;

    this.navTo("storageEntryTransactionSelectRelease", {
      "?query": { itemCode, warehouseCode }
    });
  }

  onCancel() {
    this.navTo("storageEntryTransaction");
  }

  private async getSaldosEstoque(key: string) {
    const model = this.getModel() as ODataModel;
    const func = model.bindContext("/ShipmentReleasesGetBalance(...)");
    func.setParameter("ItemCode", key);

    this.setBusy(true);

    await func.invoke();
    const resultContext = func.getBoundContext();
    const viewModel = this.getModel("balance") as JSONModel;
    viewModel.setData(resultContext.getObject() as object);

    this.setBusy(false);
  }
}
