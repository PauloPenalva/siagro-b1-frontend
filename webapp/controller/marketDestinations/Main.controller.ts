import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import BaseController from "../BaseController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { saveMarketChanges } from "siagrob1/helpers/MarketLookups";
import { MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import SessionService from "siagrob1/services/SessionService";
import { MarketDestination } from "siagrob1/types/MarketPricing";

/**
 * Cadastro de destinos do Mercado (OData `MarketDestinations`): lista + diálogo de inclusão/alteração.
 *
 * @namespace siagrob1.controller.marketDestinations
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private dialog?: Dialog;
  /** Contexto em alteração; nulo = inclusão. */
  private editing: Context | null = null;

  onInit(): void {
    this.getView().setModel(new JSONModel({ canManage: false }), "view");
    this.getView().setModel(new JSONModel({}), "dest");
    this.getRouter().getRoute("marketDestinations").attachPatternMatched(() => void this.routeMatched());
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
    return this.byId("tableMarketDestinations") as Table;
  }

  private destModel(): JSONModel {
    return this.getView().getModel("dest") as JSONModel;
  }

  onRefresh(): void {
    (this.table().getBinding("rows") as ODataListBinding)?.refresh();
  }

  private async openDialog(data: MarketDestination, editing: Context | null): Promise<void> {
    this.editing = editing;
    this.destModel().setData({ ...data });
    this.dialog ??= await this.loadFragment({ name: "siagrob1.view.marketDestinations.fragments.DestinationDialog" }) as Dialog;
    (this.byId("destinationName") as Input).setValueState("None");
    this.dialog.open();
  }

  onCreate(): void {
    void this.openDialog({ Name: "", Active: true }, null);
  }

  onEdit(): void {
    const context = this.getSelectRowContext(this.table());
    if (!context) {
      MessageBox.alert(this.text("commonSelectToEdit"));
      return;
    }
    void this.openDialog(context.getObject() as MarketDestination, context);
  }

  onDialogCancel(): void {
    this.dialog?.close();
  }

  async onDialogSave(): Promise<void> {
    const data = this.destModel().getData() as MarketDestination;
    const name = (data.Name ?? "").trim();
    const input = this.byId("destinationName") as Input;
    if (!name) {
      input.setValueState("Error");
      input.setValueStateText(this.text("marketRequiredField"));
      return;
    }
    input.setValueState("None");

    const model = this.getView().getModel() as ODataModel;
    this.setBusy(true);
    try {
      let created: Context | undefined;
      if (this.editing) {
        void this.editing.setProperty("Name", name).catch((): void => undefined);
        void this.editing.setProperty("Active", !!data.Active).catch((): void => undefined);
      } else {
        const binding = this.table().getBinding("rows") as ODataListBinding;
        created = binding.create({ Name: name, Active: !!data.Active }, false, false, false);
      }
      if (await saveMarketChanges(model, created)) {
        this.dialog?.close();
        MessageToast.show(this.text(this.editing ? "commonUpdated" : "commonSaved"));
      }
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
      // Grupo "$auto": a exclusão sai na hora; no update group diferido a promessa só resolveria no submitBatch.
      await context.delete("$auto");
      MessageToast.show(this.text("commonDeleted"));
    } catch {
      // erro já exibido pelo handler global de mensagens
    } finally {
      this.setBusy(false);
    }
  }
}
