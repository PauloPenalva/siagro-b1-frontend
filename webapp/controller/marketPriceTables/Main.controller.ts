import { SearchField$SearchEvent } from "sap/m/SearchField";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import BaseController from "../BaseController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import SessionService from "siagrob1/services/SessionService";

/**
 * Lista das tabelas de preços do Mercado (OData `MarketPriceTables`).
 *
 * @namespace siagrob1.controller.marketPriceTables
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;

  onInit(): void {
    this.getView().setModel(new JSONModel({ canManage: false }), "view");
    this.getRouter().getRoute("marketPriceTables").attachPatternMatched(() => void this.routeMatched());
  }

  private async routeMatched(): Promise<void> {
    (this.getView().getModel("view") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    this.onRefresh();
  }

  private text(key: string): string {
    return this.bundle?.getText(key) ?? key;
  }

  private table(): Table {
    return this.byId("tableMarketPriceTables") as Table;
  }

  private binding(): ODataListBinding {
    return this.table().getBinding("rows") as ODataListBinding;
  }

  onRefresh(): void {
    this.binding()?.refresh();
  }

  onSearch(ev: SearchField$SearchEvent): void {
    const query = ev.getParameter("query");
    this.binding().filter(query ? [new Filter({
      filters: [
        new Filter("Description", FilterOperator.Contains, query),
        new Filter("ItemName", FilterOperator.Contains, query),
        new Filter("HarvestSeasonCode", FilterOperator.Contains, query),
      ],
      and: false,
    })] : []);
  }

  onCreate(): void {
    this.navTo("marketPriceTablesNew");
  }

  onEdit(): void {
    const context = this.getSelectRowContext(this.table());
    if (!context) {
      MessageBox.alert(this.text("commonSelectToEdit"));
      return;
    }
    this.navTo("marketPriceTablesEdit", { id: String(context.getProperty("Id")) });
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
