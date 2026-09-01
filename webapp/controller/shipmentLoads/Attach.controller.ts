import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/** Carga alvo da vinculação, lida do servidor no início da página. */
type TargetLoad = {
  title: string,
  Key: string,
  Code: string,
  TruckCode: string,
  ItemCode: string,
  BranchCode: string,
}

/**
 * Vincular Romaneios à Carga.
 *
 * Passo dois do fluxo: a Logística já PLANEJOU a carga (páginas `Add`/`Edit`) e aqui escolhe os
 * romaneios de embarque que entram nela. Desvincular fica no `Detail`, onde os romaneios já
 * vinculados são listados.
 *
 * Como o `Edit`, esta página lê a carga do servidor em vez de receber os campos da lista: ela
 * pode ser alcançada direto pela URL, sem passar pela Montagem de Carga.
 *
 * @namespace siagrob1.controller.shipmentLoads
 */
export default class Attach extends BaseController {

  formatter = formatter;

  /** Trava de reentrância da vinculação, espelhando o `_saveInFlight` do formulário. */
  private _attachInFlight = false;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "target");

    this.getRouter().getRoute("shipmentLoadsAttach")
      .attachPatternMatched((ev) => void this.routeMatched(ev));
  }

  private async routeMatched(ev: Route$PatternMatchedEvent): Promise<void> {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    this.targetModel().setData({});

    this.setBusy(true);
    try {
      const load = await (this.getModel() as ODataModel)
        .bindContext(`/ShipmentLoads(${id})`)
        .requestObject() as Record<string, unknown>;

      // A lista já barra a carga faturada ou cancelada antes de navegar; aqui a guarda vale para
      // quem chega pela URL.
      if (load.Status !== "Planned" && load.Status !== "Open") {
        MessageBox.warning(
          `A carga ${load.Code as string} já foi faturada ou cancelada e não aceita novos romaneios.`);
        this.onNavBack();
        return;
      }

      this.targetModel().setData({
        // Placa e produto vão no TÍTULO em vez de num MessageStrip: a faixa comia a altura da
        // página e escondia a barra de rolagem horizontal da tabela de romaneios.
        title: `Vincular Romaneios — Carga ${load.Code as string} · Placa ${load.TruckCode as string}`
          + ` · Produto (${load.ItemCode as string}) ${load.ItemName as string}`,
        Key: id,
        Code: load.Code as string,
        TruckCode: load.TruckCode as string,
        ItemCode: load.ItemCode as string,
        BranchCode: load.BranchCode as string,
      } as TargetLoad);

      this.applyShipmentFilters();
    } catch (e) {
      MessageBox.error((e as Error).message);
      this.onNavBack();
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Romaneio de embarque ainda SOLTO e COMPATÍVEL com a carga alvo.
   *
   * `ShipmentLoadKey eq null` é o que faz o romaneio sumir daqui assim que entra numa carga — e
   * reaparecer quando é desvinculado ou a carga é cancelada. A placa, o produto e a filial da
   * carga entram no escopo para o usuário só enxergar o que PODE entrar.
   *
   * A página não tem filtros próprios: o escopo já reduz a lista ao que é compatível, então o
   * `$filter` é montado inteiro aqui, como string crua — `sap.ui.model.Filter` sobre enum estoura
   * "Unsupported type", porque o modelo V4 não serializa o literal.
   */
  private applyShipmentFilters(): void {
    const target = this.targetModel().getData() as Partial<TargetLoad>;

    const scope = [
      "TransactionType eq 'SalesShipment'",
      "TransactionStatus eq 'Confirmed'",
      "ShipmentLoadKey eq null",
      `TruckCode eq '${(target.TruckCode ?? "").replace(/'/g, "''")}'`,
      `ItemCode eq '${(target.ItemCode ?? "").replace(/'/g, "''")}'`,
      `BranchCode eq '${(target.BranchCode ?? "").replace(/'/g, "''")}'`,
    ];

    this.shipmentsBinding()?.changeParameters({ $filter: scope.join(" and ") });
  }

  async onAttachShipments(): Promise<void> {
    if (this._attachInFlight) return;

    const target = this.targetModel().getData() as Partial<TargetLoad>;
    if (!target?.Key) return;

    const table = this.byId("availableShipmentsTable") as Table;
    const selected = table.getSelectedIndices();

    if (selected.length < 1) {
      MessageBox.warning("Selecione ao menos 1 romaneio para vincular.");
      return;
    }

    this._attachInFlight = true;

    try {
      const keys = selected.map(i =>
        (table.getContextByIndex(i) as Context).getProperty("Key") as string);

      const action = (this.getModel() as ODataModel)
        .bindContext("/ShipmentLoadsAttachTransactions(...)");
      action.setParameter("Key", target.Key);
      action.setParameter("StorageTransactionKeys", keys);

      this.setBusy(true);
      await action.invoke();

      table.clearSelection();
      this.shipmentsBinding()?.refresh();
      MessageToast.show(`${keys.length} romaneio(s) vinculado(s) à carga ${target.Code}.`);
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
      this._attachInFlight = false;
    }
  }

  private targetModel(): JSONModel {
    return this.getView().getModel("target") as JSONModel;
  }

  private shipmentsBinding(): ODataListBinding {
    return (this.byId("availableShipmentsTable") as Table)
      ?.getBinding("rows") as ODataListBinding;
  }
}
