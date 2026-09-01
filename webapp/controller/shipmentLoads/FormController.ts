import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import Sorter from "sap/ui/model/Sorter";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/** Estado do formulário da Logística, usado tanto na criação quanto na edição. */
export type LoadForm = {
  title: string,
  isEdit: boolean,
  /** Trava produto, unidade e filial depois que a carga virou documento fiscal. */
  fiscalEditable: boolean,
  Key?: string,
  BranchCode?: string,
  LoadDate?: string,
  TruckCode?: string,
  TruckDriverCode?: string,
  TruckDriverName?: string,
  CarrierCardCode?: string,
  CarrierName?: string,
  ItemCode?: string,
  ItemName?: string,
  UnitOfMeasureCode?: string,
  WarehouseCode?: string,
  WarehouseName?: string,
  CardCode?: string,
  CardName?: string,
  HasExcess?: boolean,
  FreightPrice?: number,
  Comments?: string,
}

/**
 * Tudo o que as páginas de criação e de edição da carga têm em comum: o modelo `form` em que o
 * fragmento `LoadForm` está bindado, a lista de filiais do Select e a gravação.
 *
 * A gravação passa pelas actions `ShipmentLoadsCreate`/`ShipmentLoadsUpdate`, não por binding de
 * entidade — por isso o formulário vive num JSONModel e não num contexto do modelo OData.
 *
 * @namespace siagrob1.controller.shipmentLoads
 */
export abstract class FormController extends BaseController {

  formatter = formatter;

  /** Trava de reentrância da gravação, espelhando `_billingInFlight` do faturamento. */
  private _saveInFlight = false;

  /**
   * Prepara os modelos da página. As subclasses chamam isto no `onInit` antes de registrar a
   * própria rota, porque o fragmento já é instanciado com a view.
   */
  protected initFormModels(): void {
    this.getView().setModel(new JSONModel([]), "branches");
    this.getView().setModel(new JSONModel({}), "form");
  }

  protected formModel(): JSONModel {
    return this.getModel("form") as JSONModel;
  }

  /**
   * Carrega as filiais do Select num JSONModel estático, em vez de bind direto em `/Branchs`: um
   * JSONModel não tem suspend/resume, então nenhum controle tenta retomá-lo e o Select não depende
   * do ciclo de vida do binding OData.
   */
  protected async loadBranches(): Promise<void> {
    const oModel = this.getModel() as ODataModel;
    const contexts = await oModel.bindList("/Branchs", undefined, [new Sorter("Code")])
      .requestContexts(0, 100);
    const branches = contexts.map(ctx => ctx.getObject() as { Code: string; ShortName: string });
    (this.getModel("branches") as JSONModel).setData(branches);
  }

  async onSave(): Promise<void> {
    if (this._saveInFlight) return;
    this._saveInFlight = true;

    try {
      const form = this.formModel().getData() as LoadForm;

      const missing = this.missingRequiredField(form);
      if (missing) {
        MessageBox.warning(missing);
        return;
      }

      const action = (this.getModel() as ODataModel).bindContext(
        form.isEdit ? "/ShipmentLoadsUpdate(...)" : "/ShipmentLoadsCreate(...)");

      if (form.isEdit) {
        action.setParameter("Key", form.Key);
      }

      // Todos os parâmetros vão SEMPRE, com valor neutro quando vazios. Com seis campos
      // opcionais, o padrão "só manda se tiver valor" vira seis condicionais e uma chance real
      // de esquecer uma — e JSON.stringify omite a chave undefined, o que faz o OData rejeitar
      // o corpo inteiro. O backend trata o nulo de cada uma.
      action.setParameter("BranchCode", form.BranchCode);
      action.setParameter("LoadDate", form.LoadDate);
      action.setParameter("TruckCode", form.TruckCode);
      action.setParameter("TruckDriverCode", form.TruckDriverCode ?? "");
      action.setParameter("TruckDriverName", form.TruckDriverName ?? "");
      action.setParameter("CarrierCardCode", form.CarrierCardCode ?? "");
      action.setParameter("CarrierName", form.CarrierName ?? "");
      action.setParameter("ItemCode", form.ItemCode);
      action.setParameter("ItemName", form.ItemName ?? "");
      action.setParameter("UnitOfMeasureCode", form.UnitOfMeasureCode);
      action.setParameter("WarehouseCode", form.WarehouseCode);
      action.setParameter("WarehouseName", form.WarehouseName ?? "");
      action.setParameter("CardCode", form.CardCode ?? "");
      action.setParameter("CardName", form.CardName ?? "");
      action.setParameter("HasExcess", !!form.HasExcess);
      action.setParameter("FreightPrice", Number(form.FreightPrice ?? 0));
      action.setParameter("Comments", form.Comments ?? "");

      this.setBusy(true);
      await action.invoke();

      MessageToast.show(form.isEdit ? "Carga alterada com sucesso." : "Carga criada com sucesso.");
      this.onNavBack();
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
      this._saveInFlight = false;
    }
  }

  onCancel(): void {
    this.onNavBack();
  }

  /** A página é sempre alcançada a partir da lista, então é para lá que ela volta. */
  onNavBack(): void {
    this.navTo("shipmentLoads");
  }

  /**
   * Placa, produto e filial são obrigatórios porque são a chave de homogeneidade da vinculação:
   * sem eles não há contra o que comparar o romaneio.
   */
  private missingRequiredField(form: LoadForm): string {
    if (!form.BranchCode) return "Informe a filial da carga.";
    if (!form.TruckCode) return "Informe a placa do veículo.";
    if (!form.ItemCode) return "Informe o produto da carga.";
    if (!form.UnitOfMeasureCode) return "Informe a unidade de medida do produto.";
    if (!form.WarehouseCode) return "Informe o armazém de carga.";
    return undefined;
  }
}
