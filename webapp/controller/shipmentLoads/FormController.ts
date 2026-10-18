import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import Sorter from "sap/ui/model/Sorter";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import formatter from "siagrob1/model/formatter";
import { Select$ChangeEvent } from "sap/m/Select";
import { BaseController } from "./BaseController";

/** Estado do formulário da Logística, usado tanto na criação quanto na edição. */
export type LoadForm = {
  title: string,
  isEdit: boolean,
  /**
   * GAC-1180: placa, data e produto são decisões do planejamento e só mudam enquanto a carga é
   * Planejada. O backend recusa a alteração nos demais status.
   */
  planningEditable: boolean,
  /**
   * Trava a transportadora depois do CARREGAMENTO: ela é escolhida no planejamento e o
   * documento de saída a herda sem poder trocá-la. Continua liberada numa carga legada que
   * ainda não tem transportadora — do contrário o campo ficaria somente-leitura E obrigatório,
   * e a carga não poderia mais ser salva nem faturada.
   */
  carrierEditable: boolean,
  /**
   * GAC-1175: o tipo da carga decide que documento ela aceita e se ela fatura, e por isso só
   * pode ser escolhido na CRIAÇÃO — trocá-lo com documentos já vinculados deixaria a carga com
   * uma composição que o próprio tipo proíbe. Mesmo padrão de `ui>/typeEditable` no contrato.
   */
  typeEditable: boolean,
  Key?: string,
  /** Série de numeração (Automático/Manual); sempre enviada na criação. */
  DocNumberKey?: string,
  /** Número da carga: digitado só na série Manual; vazio na Automática (o servidor gera). */
  Code?: string,
  LoadType?: string,
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
    this.getView().setModel(new JSONModel([]), "series");
  }

  /**
   * Séries de numeração ativas da carga, num JSONModel estático (mesmo motivo das filiais: o
   * `selectedKey` vem do modelo `form`, e itens OData chegando depois deixam o Select vazio).
   * `$filter` estático porque o filtro de enum precisa dele.
   */
  protected async loadSeries(): Promise<void> {
    const oModel = this.getModel() as ODataModel;
    const contexts = await oModel.bindList("/DocNumbers", undefined,
      [new Sorter("IsManual"), new Sorter("Name")], undefined,
      { $filter: "TransactionCode eq 'ShipmentLoad' and Inactive eq false" })
      .requestContexts(0, 50);
    (this.getModel("series") as JSONModel).setData(
      contexts.map(ctx => ctx.getObject() as { Key: string; Name: string; IsManual: boolean }));
  }

  /** Escolhe a série padrão (Automático) na criação e volta ao modo automático. */
  protected async selectDefaultSeries(): Promise<void> {
    this.startDocNumberCreate();
    const info = (await this.getDocNumberInfoByTransaction("ShipmentLoad")).find(x => x.Default);
    this.formModel().setProperty("/DocNumberKey", info?.Key ?? null);
  }

  /**
   * Série mudou: Manual libera o número; ao voltar para Automático o número digitado é descartado.
   * Versão do `onDocNumberSeriesChange` para o modelo `form` (JSON), em que não há contexto OData.
   */
  onLoadSeriesChange(event: Select$ChangeEvent): void {
    const key = event.getParameter("selectedItem")?.getKey();
    const series = (this.getModel("series") as JSONModel).getData() as { Key: string; IsManual: boolean }[];
    const isManual = series.find(x => x.Key === key)?.IsManual === true;

    (this.getModel("ui") as JSONModel).setProperty("/docNumberManual", isManual);

    if (!isManual) {
      this.formModel().setProperty("/Code", "");
    }
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

      // Só na criação: ShipmentLoadsUpdate não declara LoadType no EDM, e mandá-lo ali faria o
      // OData rejeitar o corpo inteiro.
      if (!form.isEdit) {
        action.setParameter("LoadType", form.LoadType ?? "Normal");
        // Sempre a série; Code vazio na Automática (sem DocNumberKey o servidor trata o código como legado).
        action.setParameter("DocNumberKey", form.DocNumberKey ?? null);
        action.setParameter("Code", (form.Code ?? "").trim());
      }

      this.setBusy(true);
      await action.invoke();

      MessageToast.show(form.isEdit ? "Carga alterada com sucesso." : "Carga criada com sucesso.");

      // Inclusão: abre direto o detalhe da carga criada (onde estão Expedir e Faturar). A resposta é camelCase
      // (Ok(new { … })). Navegação com replace: o "voltar" do detalhe leva à lista, não de volta ao formulário.
      const created = form.isEdit ? null : action.getBoundContext()?.getObject() as { key?: string; Key?: string };
      const createdKey = created?.key ?? created?.Key;
      if (createdKey) {
        this.navTo("shipmentLoadsDetail", { id: createdKey }, true);
        return;
      }

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
   * sem eles não há contra o que comparar o romaneio. A transportadora entra na lista porque o
   * faturamento a exige e a copia da carga: sem ela aqui, a carga nasce impossível de faturar.
   *
   * O `required` do fragmento é só o asterisco — a validação de verdade é esta.
   */
  private missingRequiredField(form: LoadForm): string {
    if (!form.isEdit && !form.DocNumberKey) return "Informe a série de numeração da carga.";
    if (!form.isEdit && (this.getModel("ui") as JSONModel).getProperty("/docNumberManual") === true && !(form.Code ?? "").trim()) {
      return "Informe o número da carga.";
    }
    if (!form.BranchCode) return "Informe a filial da carga.";
    if (!form.TruckCode) return "Informe a placa do veículo.";
    if (!form.CarrierCardCode) return "Informe a transportadora da carga.";
    if (!form.ItemCode) return "Informe o produto da carga.";
    if (!form.UnitOfMeasureCode) return "Informe a unidade de medida do produto.";
    if (!form.WarehouseCode) return "Informe o armazém de carga.";
    return undefined;
  }
}
