import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.shipmentLoads
 */
export default class Detail extends BaseController {

  formatter = formatter;

  private _loadKey: string;

  onInit(): void {
    this.getRouter().getRoute("shipmentLoadsDetail")
      .attachPatternMatched((ev) => this.detailRouteMatched(ev));
  }

  private detailRouteMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    this._loadKey = id;
    this.bindElement(`/ShipmentLoads(${id})`);
  }

  async onRecalculate(): Promise<void> {
    const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsRecalculateInvoiced(...)");
    action.setParameter("Key", this._loadKey);

    this.setBusy(true);
    try {
      await action.invoke();
      this.refreshAll();
      MessageToast.show("Saldo recalculado.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  async onCancelLoad(): Promise<void> {
    const reason = await DialogHelper.promptDialog(
      "Cancelar Carga", "Informe o motivo do cancelamento:");

    if (!reason) return;

    const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsCancel(...)");
    action.setParameter("Key", this._loadKey);
    action.setParameter("CancellationReason", reason);

    this.setBusy(true);
    try {
      await action.invoke();
      this.refreshAll();
      MessageToast.show("Carga cancelada. Romaneios devolvidos à montagem.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Desvincula romaneios, devolvendo-os à lista de disponíveis.
   *
   * O backend recusa se houver documento de saída vivo na carga: encolher o volume por baixo de
   * uma nota já emitida furaria a invariante que o guard de faturamento não vigia — ele valida
   * o que entra, não o que sai. A mensagem de recusa vem de lá.
   */
  async onDetachShipments(): Promise<void> {
    const table = this.byId("loadTransactionsTable") as Table;
    const selected = table.getSelectedIndices();

    if (selected.length < 1) {
      MessageBox.warning("Selecione ao menos 1 romaneio para desvincular.");
      return;
    }

    if (!await DialogHelper.confirmDialog(
      `Desvincular ${selected.length} romaneio(s) desta carga ?`)) return;

    const keys = selected.map(i =>
      (table.getContextByIndex(i) as Context).getProperty("Key") as string);

    const action = (this.getModel() as ODataModel)
      .bindContext("/ShipmentLoadsDetachTransactions(...)");
    action.setParameter("Key", this._loadKey);
    action.setParameter("StorageTransactionKeys", keys);

    this.setBusy(true);
    try {
      await action.invoke();
      table.clearSelection();
      this.refreshAll();
      MessageToast.show(`${keys.length} romaneio(s) desvinculado(s).`);
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  onNavBack(): void {
    this.navTo("shipmentLoads");
  }

  /**
   * Recarrega o cabeçalho e as três coleções. Elas só respondem a `refresh()` porque estão
   * bindadas com `$$ownRequest`; como `$expand` do pai, ficariam presas ao cache do elemento.
   */
  private refreshAll(): void {
    // O contexto do elemento é o do modelo V4 e sabe se recarregar; o tipo devolvido pela
    // view é o genérico, daí o cast.
    (this.getView().getBindingContext() as Context)?.refresh();

    ["loadTransactionsTable", "loadInvoicesTable", "loadMovementsTable"].forEach(id => {
      const binding = (this.byId(id) as Table)?.getBinding("rows") as ODataListBinding;
      binding?.refresh();
    });
  }
}
