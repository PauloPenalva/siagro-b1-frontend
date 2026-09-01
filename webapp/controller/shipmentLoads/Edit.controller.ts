import MessageBox from "sap/m/MessageBox";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { FormController, LoadForm } from "./FormController";

/**
 * Editar Carga.
 *
 * Diferente do `Add`, esta página lê a carga do servidor: ela pode ser alcançada direto pela URL,
 * sem passar pela lista, então não há contexto de tabela de onde copiar os campos.
 *
 * @namespace siagrob1.controller.shipmentLoads
 */
export default class Edit extends FormController {

  private _branchesLoaded = false;

  onInit(): void {
    this.initFormModels();

    this.getRouter().getRoute("shipmentLoadsEdit")
      .attachPatternMatched((ev) => void this.editRouteMatched(ev));
  }

  private async editRouteMatched(ev: Route$PatternMatchedEvent): Promise<void> {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    this.formModel().setData({});

    if (!this._branchesLoaded) {
      this._branchesLoaded = true;
      await this.loadBranches();
    }

    this.setBusy(true);
    try {
      const load = await (this.getModel() as ODataModel)
        .bindContext(`/ShipmentLoads(${id})`)
        .requestObject() as Record<string, unknown>;

      // A lista já barra a carga cancelada antes de navegar; aqui a guarda vale para quem chega
      // pela URL.
      if (load.Status === "Cancelled") {
        MessageBox.warning("Carga cancelada não pode ser alterada.");
        this.onNavBack();
        return;
      }

      this.formModel().setData({
        title: `Editar Carga ${load.Code as string}`,
        isEdit: true,
        // Produto, unidade e filial já viraram linha de nota: travam. O resto segue editável,
        // porque o caso real é "o motorista trocou depois de carregar".
        fiscalEditable: load.Status !== "PartiallyInvoiced" && load.Status !== "Invoiced",
        Key: id,
        BranchCode: load.BranchCode as string,
        LoadDate: (load.LoadDate as string)?.slice(0, 10),
        TruckCode: load.TruckCode as string,
        TruckDriverCode: load.TruckDriverCode as string,
        TruckDriverName: load.TruckDriverName as string,
        CarrierCardCode: load.CarrierCardCode as string,
        CarrierName: load.CarrierName as string,
        ItemCode: load.ItemCode as string,
        ItemName: load.ItemName as string,
        UnitOfMeasureCode: load.UnitOfMeasureCode as string,
        WarehouseCode: load.WarehouseCode as string,
        WarehouseName: load.WarehouseName as string,
        CardCode: load.CardCode as string,
        CardName: load.CardName as string,
        HasExcess: !!load.HasExcess,
        FreightPrice: load.FreightPrice as number,
        Comments: load.Comments as string,
      } as LoadForm);
    } catch (e) {
      MessageBox.error((e as Error).message);
      this.onNavBack();
    } finally {
      this.setBusy(false);
    }
  }
}
