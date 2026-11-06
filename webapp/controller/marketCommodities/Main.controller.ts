import { SearchField$SearchEvent } from "sap/m/SearchField";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Sorter from "sap/ui/model/Sorter";
import Table from "sap/ui/table/Table";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import BaseController from "../BaseController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { marketFetch } from "siagrob1/helpers/MarketHelpers";
import { MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";

/**
 * Lista de commodities da posição de mercado (OData `MarketCommodities`).
 *
 * @namespace siagrob1.controller.marketCommodities
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;

  /** Texto da bolsa de hedge (campo de instância, não getter: o UI5 resolve `.exchangeText` por nome). */
  exchangeText = (exchange: string): string => (exchange ? this.text(`marketHedgeExchange_${exchange}`) : "");

  onInit(): void {
    this.getView().setModel(new JSONModel({ canManage: false }), "view");
    this.getRouter().getRoute("marketCommodities").attachPatternMatched(() => void this.routeMatched());
  }

  private async routeMatched(): Promise<void> {
    (this.getView().getModel("view") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    if (!this.binding()) {
      this.table().bindRows({
        path: "/MarketCommodities",
        parameters: { $select: "Code,Name,HedgeExchange,Active" },
        sorter: new Sorter("Name"),
      });
      return;
    }
    this.onRefresh();
  }

  private text(key: string, args?: string[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  private table(): Table {
    return this.byId("tableMarketCommodities") as Table;
  }

  private binding(): ODataListBinding {
    return this.table().getBinding("rows") as ODataListBinding;
  }

  onRefresh(): void {
    this.binding()?.refresh();
  }

  onSearch(ev: SearchField$SearchEvent): void {
    const query = ev.getParameter("query");
    this.binding()?.filter(query ? [new Filter({
      filters: [
        new Filter("Code", FilterOperator.Contains, query),
        new Filter("Name", FilterOperator.Contains, query),
      ],
      and: false,
    })] : []);
  }

  onCreate(): void {
    this.navTo("marketCommoditiesNew");
  }

  onEdit(): void {
    const context = this.getSelectRowContext(this.table());
    if (!context) {
      const canManage = (this.getView().getModel("view") as JSONModel).getProperty("/canManage") as boolean;
      MessageBox.alert(this.text(canManage ? "commonSelectToEdit" : "marketSelectToView"));
      return;
    }
    this.navTo("marketCommoditiesEdit", { code: String(context.getProperty("Code")) });
  }

  /** Cria as commodities de exemplo (soja, milho...) que ainda não existem; idempotente no servidor. */
  async onCreateSamples(): Promise<void> {
    this.setBusy(true);
    try {
      const result = await marketFetch<{ created: number }>("POST", ServerRoutes.marketCommoditySamples);
      if (!result.ok) {
        MessageBox.error(result.message || this.text("marketCommoditySamplesFailed"));
        return;
      }
      MessageToast.show(this.text("marketCommoditySamplesCreated", [String(result.data?.created ?? 0)]));
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  async onDelete(): Promise<void> {
    const context = this.getSelectRowContext(this.table());
    if (!context) {
      MessageBox.alert(this.text("commonSelectToDelete"));
      return;
    }
    if (!(await confirmDialog(this.text("commonDeleteConfirm"), this.text("commonDelete")))) return;

    this.setBusy(true);
    try {
      await context.delete("$auto");
      MessageToast.show(this.text("commonDeleted"));
    } catch {
      // erro já exibido pelo handler global de mensagens
    } finally {
      this.setBusy(false);
    }
  }
}
