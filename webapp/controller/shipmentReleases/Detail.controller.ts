/* eslint-disable @typescript-eslint/no-redundant-type-constituents -- strictNullChecks está desligado no projeto; "| undefined"/"| null" documentam o contrato */
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Fragment from "sap/ui/core/Fragment";
import Control from "sap/ui/core/Control";
import Event from "sap/ui/base/Event";
import { BaseController } from "./BaseController";
import formatter from "siagrob1/model/formatter";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { sendJson, odataValue } from "siagrob1/helpers/FetchHelpers";
import { canIssueRemittance, isRemittancePriceValid, StorageRemittanceSummary } from "siagrob1/helpers/StorageDepositHelpers";

/**
 * @namespace siagrob1.controller.shipmentReleases
 */
export default class Detail extends BaseController {

  formatter = formatter;

  private remittanceDialog?: Dialog;

  onInit(): void {
    this.getView().setModel(new JSONModel({
      visible: false, canIssue: false, summary: undefined, dialog: {},
    }), "remittance");
    this.getRouter().getRoute("shipmentReleasesDetail")
      .attachPatternMatched((ev) => this.detailRouteMatched(ev));
  }

  private detailRouteMatched(ev: Route$MatchedEvent) {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    (this.getModel("ui") as JSONModel).setProperty("/editable", false);
    this.bindElement(`/ShipmentReleases(${id})`);
    this.filterTransactions(id);
    void this.loadRemittance(id);
  }

  /**
   * Remessa para depósito: só STANDALONE. Em SAPB1 a seção e o botão ficam ocultos e nada é
   * pedido ao servidor. O Status é lido por um binding próprio (e não pelo contexto da view),
   * porque no route matched o contexto da view ainda pode não ter chegado.
   */
  private async loadRemittance(id: string): Promise<void> {
    const model = this.getView().getModel("remittance") as JSONModel;
    model.setProperty("/canIssue", false);
    model.setProperty("/summary", undefined);

    const isStandalone = (await this.getSystemInfo())?.erp === "STANDALONE";
    model.setProperty("/visible", isStandalone);
    if (!isStandalone) return;

    const result = await sendJson("GET", `${ServerRoutes.shipmentReleasesStorageRemittanceSummary}(Key=${id})`);
    const summary = result.ok ? odataValue<StorageRemittanceSummary>(result.data) : undefined;

    let status: string | undefined;
    try {
      const odataModel = this.getModel() as ODataModel;
      status = await odataModel.bindContext(`/ShipmentReleases(${id})`).requestObject("Status") as string;
    } catch {
      status = undefined;
    }

    // Descarta a resposta se o usuário já trocou de liberação enquanto esperava.
    const current = (this.getView().getBindingContext() as Context | undefined)?.getProperty("Key") as string | undefined;
    if (current && current.toLowerCase() !== id.toLowerCase()) return;

    model.setProperty("/summary", summary);
    model.setProperty("/canIssue", canIssueRemittance(status, summary, true));
  }

  async onOpenRemittanceDialog(): Promise<void> {
    const model = this.getView().getModel("remittance") as JSONModel;
    model.setProperty("/dialog", { usageCode: null, usageName: "", unitPrice: "" });
    this.remittanceDialog ??= await Fragment.load({
      id: this.getView().getId(),
      name: "siagrob1.view.shipmentReleases.fragments.StorageRemittanceDialog",
      controller: this,
    }) as Dialog;
    this.getView().addDependent(this.remittanceDialog);
    this.remittanceDialog.open();
  }

  async onRemittanceUsageValueHelp(): Promise<void> {
    const selected = await DialogHelper.openTableSelectDialog(
      this, "UsagesSelectDialog", ["Name", "Description"],
      [new Filter("Inactive", FilterOperator.EQ, false)], undefined,
      "StorageDepositRole eq 'Remittance' and Direction eq 'Outgoing'");
    if (!selected) return;
    const model = this.getView().getModel("remittance") as JSONModel;
    model.setProperty("/dialog/usageCode", selected.getProperty("Code"));
    model.setProperty("/dialog/usageName", selected.getProperty("Name"));
  }

  async onConfirmRemittance(): Promise<void> {
    const model = this.getView().getModel("remittance") as JSONModel;
    const dialog = model.getProperty("/dialog") as { usageCode: number | null; unitPrice: string | number };
    if (!dialog.usageCode) { MessageBox.warning("Escolha a natureza de remessa para depósito."); return; }
    if (!isRemittancePriceValid(dialog.unitPrice)) { MessageBox.warning("Informe o preço unitário da remessa."); return; }

    const key = (this.getView().getBindingContext() as Context).getProperty("Key") as string;
    const price = typeof dialog.unitPrice === "number"
      ? dialog.unitPrice
      : Number(String(dialog.unitPrice).replace(/\./g, "").replace(",", "."));

    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.shipmentReleasesCreateStorageRemittance,
        { ShipmentReleaseKey: key, UsageCode: dialog.usageCode, UnitPrice: price });
      if (!result.ok) { MessageBox.error(result.message); return; }
      this.remittanceDialog?.close();
      MessageToast.show("Remessa criada. Confira transporte e pesos, confirme e emita a NF-e.", { closeOnBrowserNavigation: false });
      this.navTo("salesInvoicesDetail", { id: odataValue<string>(result.data) });
    } finally {
      this.setBusy(false);
    }
  }

  onCancelRemittance(): void { this.remittanceDialog?.close(); }

  onOpenRemittance(): void {
    const key = (this.getView().getModel("remittance") as JSONModel).getProperty("/summary/RemittanceKey") as string;
    if (key) this.navTo("salesInvoicesDetail", { id: key });
  }

  onOpenReturn(ev: Event): void {
    const ctx = ev.getSource<Control>().getBindingContext("remittance");
    const key = ctx?.getProperty("PurchaseInvoiceKey") as string | undefined;
    if (key) this.navTo("purchaseInvoicesDetail", { id: key });
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
