import { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { marketFetch, notFoundTextKey } from "siagrob1/helpers/MarketHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import SessionService from "siagrob1/services/SessionService";

/**
 * Cadastro de instrumentos do módulo Mercado (OData `MarketInstruments`, chave `Code`).
 *
 * @namespace siagrob1.controller.marketInstruments
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;

  onInit(): void {
    this.getView().setModel(new JSONModel({ isAdmin: false, canManage: false }), "view");
    this.getRouter().getRoute("marketInstruments").attachPatternMatched(() => void this.routeMatched());
  }

  private async routeMatched(): Promise<void> {
    (this.getView().getModel("view") as JSONModel).setProperty("/isAdmin", SessionService.hasRole("ADMIN"));
    (this.getView().getModel("view") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    // O bundle chega antes do refresh: os formatters de Bolsa/Tipo leem dele (sem ele mostravam a chave).
    this.bundle ??= await this.getResourceBundle();
    this.onRefresh();
  }

  private text(key: string, args?: string[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  // Formatters chamados com `this` = controller (prefixo "." na view).
  exchangeText(value: string): string {
    return value ? this.text(`marketExchange${value}`) : "";
  }

  typeText(value: string): string {
    return value ? this.text(`marketType${value}`) : "";
  }

  private binding(): ODataListBinding {
    return this.byId("tableMarketInstruments").getBinding("rows") as ODataListBinding;
  }

  onRefresh(): void {
    this.binding()?.refresh();
  }

  onSearch(ev: SearchField$SearchEvent): void {
    const query = ev.getParameter("query");
    this.binding().filter(query ? [new Filter({
      filters: [
        new Filter("Code", FilterOperator.Contains, query),
        new Filter("Description", FilterOperator.Contains, query),
        new Filter("GroupName", FilterOperator.Contains, query),
      ],
      and: false,
    })] : []);
  }

  onCreate(): void {
    this.navTo("marketInstrumentsNew");
  }

  private selectedContext(): Context | undefined {
    return this.getSelectRowContext(this.byId("tableMarketInstruments") as Table);
  }

  onEdit(): void {
    const context = this.selectedContext();
    if (!context) {
      MessageBox.alert(this.text("commonSelectToEdit"));
      return;
    }
    this.navTo("marketInstrumentsEdit", { id: context.getProperty("Code") as string });
  }

  async onDelete(): Promise<void> {
    const context = this.selectedContext();
    if (!context) {
      MessageBox.alert(this.text("commonSelectToDelete"));
      return;
    }
    if (!(await confirmDialog(this.text("commonDeleteConfirm"), this.text("commonDelete")))) return;

    const model = this.getView().getModel() as ODataModel;
    try {
      this.setBusy(true);
      await context.delete("$auto");
      await model.submitBatch(model.getUpdateGroupId());
      if (!model.hasPendingChanges(model.getUpdateGroupId())) {
        MessageToast.show(this.text("commonDeleted"));
      }
    } finally {
      this.setBusy(false);
    }
  }

  async onCreateSamples(): Promise<void> {
    this.setBusy(true);
    try {
      const result = await marketFetch<{ created: number }>("POST", ServerRoutes.marketInstrumentSamples);
      if (!result.ok) {
        if (result.status === 404) MessageBox.warning(this.text(notFoundTextKey(result.moduleDisabled)));
        else MessageBox.error(result.message || this.text("marketGenericError"));
        return;
      }
      this.onRefresh();
      MessageToast.show(this.text("marketSamplesCreated", [String(result.data?.created ?? 0)]));
    } finally {
      this.setBusy(false);
    }
  }
}
