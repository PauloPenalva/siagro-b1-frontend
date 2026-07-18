import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import { BaseController } from "./BaseController";
import formatter from "siagrob1/model/formatter";

/**
 * @namespace siagrob1.controller.shipmentReleases
 */
export default class Detail extends BaseController {

  formatter = formatter;

  onInit(): void {
    this.getRouter().getRoute("shipmentReleasesDetail")
      .attachPatternMatched((ev) => this.detailRouteMatched(ev));
  }

  private detailRouteMatched(ev: Route$MatchedEvent) {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    (this.getModel("ui") as JSONModel).setProperty("/editable", false);
    this.bindElement(`/ShipmentReleases(${id})`);
    this.filterTransactions(id);
  }

  /**
   * Filtra os romaneios da liberação. Só o predicado de chave vem para cá: o de tipo
   * (Purchase/PurchaseReturn) é constante e fica como $filter estático no binding do
   * fragmento, porque o modelo OData V4 não serializa literais de tipo enum em
   * sap.ui.model.Filter — resulta em "Unsupported type: SIAGROB1.StorageTransactionType".
   * O ODataListBinding combina o $filter estático e os filtros dinâmicos com AND.
   */
  private filterTransactions(releaseKey: string): void {
    const oBinding = (this.byId("tableReleaseTransactions") as Table)
      .getBinding("rows") as ODataListBinding;

    oBinding.filter(new Filter("ShipmentReleaseKey", FilterOperator.EQ, releaseKey));
  }

  onNavBack(): void {
    this.navTo("shipmentReleases");
  }
}
