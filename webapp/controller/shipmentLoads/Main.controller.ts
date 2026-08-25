import Dialog from "sap/m/Dialog";
import { IconTabBar$SelectEvent } from "sap/m/IconTabBar";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Fragment from "sap/ui/core/Fragment";
import JSONModel from "sap/ui/model/json/JSONModel";
import Sorter from "sap/ui/model/Sorter";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/** Romaneio selecionado na aba de disponíveis. */
type AvailableShipment = {
  Key: string,
  Code: string,
  ItemCode: string,
  ItemName: string,
  UnitOfMeasureCode: string,
  TruckCode: string,
  GrossWeight: number,
  Branch?: { Code?: string },
  BranchCode?: string,
}

/**
 * @namespace siagrob1.controller.shipmentLoads
 */
export default class Main extends BaseController {

  formatter = formatter;

  private _assembleDialog: Dialog;
  /** Trava de reentrância da montagem, espelhando `_billingInFlight` do faturamento. */
  private _assembleInFlight = false;
  private _branchesLoaded = false;

  onInit(): void {
    this.getView().setModel(new JSONModel(), "filterShipments");
    this.getView().setModel(new JSONModel(), "filterLoads");
    this.getView().setModel(new JSONModel([]), "branches");

    this.getRouter().getRoute("shipmentLoads")
      .attachPatternMatched(() => {
        // this.getModel() só resolve o OData model depois que a rota casa (onInit é cedo demais).
        if (!this._branchesLoaded) {
          this._branchesLoaded = true;
          void this.loadBranches();
        }
        this.applyShipmentFilters();
        this.applyLoadFilters();
      });
  }

  /**
   * Os dois Selects de Filial (um por aba) carregam a lista UMA vez num JSONModel estático, em vez
   * de bind direto em `/Branchs` com `suspended: true`: a sap.ui.comp.filterbar.FilterBar resume()
   * incondicionalmente o binding suspenso de um Select toda vez que sua aba volta a ficar visível,
   * mas nunca o suspende de novo — e como o IconTabBar força um re-render completo do conteúdo a
   * cada troca de aba (não só show/hide), a segunda vez que qualquer aba reaparece o resume() da
   * vendor lib estoura "Cannot resume a not suspended binding" NO MEIO do onBeforeRendering e
   * aborta a troca visual — sintoma: a aba clicada não atualiza a tela. Tentar resuspender o
   * binding manualmente (ex.: num handler de `dataReceived`) não segura: a FilterBar troca a
   * instância do binding entre renders, então o listener fica pendurado no objeto errado. Um
   * JSONModel não tem suspend/resume, então a FilterBar nem tenta — o bug nem existe pra esse tipo
   * de binding.
   */
  private async loadBranches(): Promise<void> {
    const oModel = this.getModel() as ODataModel;
    const contexts = await oModel.bindList("/Branchs", undefined, [new Sorter("Code")])
      .requestContexts(0, 100);
    const branches = contexts.map(ctx => ctx.getObject() as { Code: string; ShortName: string });
    (this.getView().getModel("branches") as JSONModel).setData(branches);
  }

  onTabSelect(ev: IconTabBar$SelectEvent): void {
    const selectedKey = ev.getSource().getSelectedKey();
    if (selectedKey === "availableShipments") {
      this.refreshShipments();
    } else if (selectedKey === "loads") {
      this.refreshLoads();
    }
  }

  onSearchShipmentFilters(): void {
    this.applyShipmentFilters();
  }

  onClearShipmentFilters(): void {
    (this.getModel("filterShipments") as JSONModel).setData({});
    this.applyShipmentFilters();
  }

  onSearchLoadFilters(): void {
    this.applyLoadFilters();
  }

  onClearLoadFilters(): void {
    (this.getModel("filterLoads") as JSONModel).setData({});
    this.applyLoadFilters();
  }

  /**
   * Monta o `$filter` a partir do modelo de filtro da aba e o aplica como parâmetro estático do
   * binding. `exactMatchFields` cobre enum/status e código de filial — comparados com `eq` em
   * string crua, porque `sap.ui.model.Filter` sobre enum estoura "Unsupported type" (o modelo V4
   * não serializa o literal). Os demais campos entram com `contains`, e `DateFrom`/`DateTo` viram
   * `ge`/`le` sobre `dateProperty`.
   */
  private applyFilters(
    tableId: string,
    filterModelName: string,
    dateProperty: string,
    exactMatchFields: string[],
    fixedScope: string[] = [],
  ): void {
    const binding = (this.byId(tableId) as Table).getBinding("rows") as ODataListBinding;
    const filterData = ((this.getModel(filterModelName) as JSONModel)?.getData()
      ?? {}) as Record<string, string>;
    const filters: string[] = [...fixedScope];

    Object.keys(filterData).forEach((key) => {
      const value = filterData[key];
      if (!value) return;
      const esc = value.replace(/'/g, "''");

      if (exactMatchFields.includes(key)) {
        filters.push(`${key} eq '${esc}'`);
      } else if (key === "DateFrom") {
        filters.push(`${dateProperty} ge ${esc}`);
      } else if (key === "DateTo") {
        filters.push(`${dateProperty} le ${esc}`);
      } else {
        filters.push(`contains(${key},'${esc}')`);
      }
    });

    binding.changeParameters({ $filter: filters.length > 0 ? filters.join(" and ") : undefined });
  }

  /**
   * Romaneio de embarque ainda SOLTO. `ShipmentLoadKey eq null` é o que faz o romaneio sumir
   * daqui assim que entra numa carga — e reaparecer quando a carga é cancelada.
   */
  private applyShipmentFilters(): void {
    this.applyFilters("availableShipmentsTable", "filterShipments", "TransactionDate", ["BranchCode"], [
      "TransactionType eq 'SalesShipment'",
      "TransactionStatus eq 'Confirmed'",
      "ShipmentLoadKey eq null",
    ]);
  }

  /** Carga cancelada continua listada: é histórico, e some só do faturamento. */
  private applyLoadFilters(): void {
    this.applyFilters("shipmentLoadsTable", "filterLoads", "LoadDate", ["Status", "BranchCode"]);
  }

  async onAssembleLoad(): Promise<void> {
    const table = this.byId("availableShipmentsTable") as Table;
    const selected = table.getSelectedIndices();

    if (selected.length < 1) {
      MessageBox.warning("Selecione ao menos 1 romaneio para montar a carga.");
      return;
    }

    // As três checagens de aglutinação. Migraram do faturamento para cá: é aqui que a
    // aglutinação passa a ser decidida. A de FILIAL é nova — o backend sempre a exigiu, mas
    // a tela antiga não perguntava, e o usuário só descobriria pelo erro do servidor.
    if (this.hasInconsistency(selected, "TruckCode")) {
      MessageBox.warning("Placas diferentes selecionadas.");
      return;
    }

    if (this.hasInconsistency(selected, "ItemCode")) {
      MessageBox.warning("Produtos diferentes selecionados.");
      return;
    }

    if (this.hasInconsistency(selected, "BranchCode")) {
      MessageBox.warning("Filiais diferentes selecionadas.");
      return;
    }

    await this.createAssembleDialog();

    const shipments: AvailableShipment[] = selected.map(i =>
      (table.getContextByIndex(i) as Context).getObject() as AvailableShipment);

    const totalQuantity = shipments.reduce((sum, s) => sum + Number(s.GrossWeight), 0);

    (this.getModel("viewModel") as JSONModel).setData({
      TruckCode: shipments[0]?.TruckCode,
      ItemCode: shipments[0]?.ItemCode,
      ItemName: shipments[0]?.ItemName,
      UnitOfMeasureCode: shipments[0]?.UnitOfMeasureCode,
      ShipmentCount: shipments.length,
      TotalQuantity: totalQuantity,
      Comments: "",
      StorageTransactionKeys: shipments.map(s => s.Key),
    });

    this._assembleDialog.open();
  }

  async saveAssembleLoadDialog(): Promise<void> {
    if (this._assembleInFlight) return;
    this._assembleInFlight = true;

    try {
      const viewModel = this.getModel("viewModel") as JSONModel;
      const keys = viewModel.getProperty("/StorageTransactionKeys") as string[];
      const comments = viewModel.getProperty("/Comments") as string;

      const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsCreate(...)");
      action.setParameter("StorageTransactionKeys", keys);
      // Só manda o parâmetro opcional quando há texto: JSON.stringify omite undefined, e o
      // backend trata a ausência.
      if (comments) {
        action.setParameter("Comments", comments);
      }

      this.setBusy(true);
      await action.invoke();

      this.closeAssembleLoadDialog();
      this.refreshShipments();
      this.refreshLoads();
      MessageToast.show("Carga montada com sucesso.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
      this._assembleInFlight = false;
    }
  }

  closeAssembleLoadDialog(): void {
    (this.byId("availableShipmentsTable") as Table).clearSelection();
    this._assembleDialog?.close();
  }

  /**
   * Estorno do romaneio de embarque, migrado do `/shipment-billing`: aqui é o único lugar em
   * que o romaneio ainda está solto, que é a condição para poder estornar.
   */
  async onReverseShipment(): Promise<void> {
    const table = this.byId("availableShipmentsTable") as Table;
    const selected = table.getSelectedIndices();

    if (selected.length < 1) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    if (selected.length > 1) {
      MessageBox.warning("Selecione apenas um registro por vez.");
      return;
    }

    if (await DialogHelper.confirmDialog("Estornar Embarque ?")) {
      const ctx = table.getContextByIndex(selected[0]) as Context;
      const action = (this.getModel() as ODataModel).bindContext("/ShippingTransactionsReverse(...)");
      action.setParameter("Key", ctx.getProperty("Key"));

      this.setBusy(true);
      try {
        await action.invoke();
        this.refreshShipments();
        MessageToast.show("Embarque estornado com sucesso.");
      } catch (e) {
        MessageBox.error((e as Error).message);
      } finally {
        this.setBusy(false);
      }
    }
  }

  async onCancelLoad(): Promise<void> {
    const table = this.byId("shipmentLoadsTable") as Table;
    const selected = table.getSelectedIndices();

    if (selected.length !== 1) {
      MessageBox.warning("Selecione uma carga.");
      return;
    }

    const ctx = table.getContextByIndex(selected[0]) as Context;

    const reason = await DialogHelper.promptDialog(
      "Cancelar Carga", "Informe o motivo do cancelamento:");

    if (!reason) return;

    const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsCancel(...)");
    action.setParameter("Key", ctx.getProperty("Key"));
    action.setParameter("CancellationReason", reason);

    this.setBusy(true);
    try {
      await action.invoke();
      this.refreshShipments();
      this.refreshLoads();
      MessageToast.show("Carga cancelada. Romaneios devolvidos à montagem.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  onOpenDetail(): void {
    const table = this.byId("shipmentLoadsTable") as Table;
    const selected = table.getSelectedIndices();

    if (selected.length !== 1) {
      MessageBox.warning("Selecione uma carga.");
      return;
    }

    const ctx = table.getContextByIndex(selected[0]) as Context;
    this.navTo("shipmentLoadsDetail", { id: ctx.getProperty("Key") as string });
  }

  private hasInconsistency(selected: number[], property: string): boolean {
    const table = this.byId("availableShipmentsTable") as Table;

    const values = selected.map(i =>
      (table.getContextByIndex(i) as Context).getProperty(property) as string);

    return values.some(v => v !== values[0]);
  }

  private async createAssembleDialog(): Promise<void> {
    const oView = this.getView();
    this._assembleDialog = this.byId("assembleLoadDialog") as Dialog;

    if (!this._assembleDialog) {
      this.setBusy(true);
      this._assembleDialog = await Fragment.load({
        id: oView.getId(),
        name: "siagrob1.view.shipmentLoads.fragments.AssembleLoad",
        controller: this,
      }) as unknown as Dialog;
      oView.addDependent(this._assembleDialog);
      this.setBusy(false);
    }
  }

  private refreshShipments(): void {
    ((this.byId("availableShipmentsTable") as Table)
      .getBinding("rows") as ODataListBinding).refresh();
  }

  private refreshLoads(): void {
    ((this.byId("shipmentLoadsTable") as Table)
      .getBinding("rows") as ODataListBinding).refresh();
  }
}
