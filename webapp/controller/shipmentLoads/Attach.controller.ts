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

/**
 * Papel do romaneio ao ser vinculado (GAC-1181, Task 11). `Key` vazia é a Origem — sem
 * restrição extra de armazém, como sempre foi; um transbordo restringe ao `WarehouseCode` DELE.
 */
type AttachRoleOption = { Key: string; Text: string; WarehouseCode: string };

/** Carga alvo da vinculação, lida do servidor no início da página. */
type TargetLoad = {
  title: string,
  Key: string,
  Code: string,
  LoadType: string,
  TruckCode: string,
  ItemCode: string,
  BranchCode: string,
  /** Chave do papel selecionado no Select "Vincular como" — "" é Origem. */
  role: string,
  roles: AttachRoleOption[],
}

/**
 * Tipo de romaneio que cada natureza de carga aceita (GAC-1175) - espelha
 * ShipmentLoadsAttachTransactionsService.ExpectedTransactionType no backend.
 */
function expectedTransactionType(loadType: string): string {
  return loadType === "Removal" ? "Receipt" : "SalesShipment";
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

      // A lista já barra a carga encerrada ou cancelada antes de navegar; aqui a guarda vale
      // para quem chega pela URL.
      if (load.Status !== "Planned" && load.Status !== "Open" &&
          load.Status !== "InTransshipment") {
        MessageBox.warning(
          `A carga ${load.Code as string} já foi encerrada ou cancelada e não aceita novos romaneios.`);
        this.onNavBack();
        return;
      }

      // GAC-1181, Task 11: só a carga Normal tem transbordo (a Remoção nunca abre um — mesma
      // guarda de ShipmentLoadTransshipmentRules.EnsureLoadAcceptsTransshipment); evita uma
      // consulta cuja resposta seria sempre vazia.
      //
      // ⚠️ "Origem" entra AQUI, na lista, e não como item estático no XML: o Select tem a
      // agregação `items` bindada, e agregação bindada descarta o que for declarado ao lado do
      // template — o item estático sumia e a carga sem transbordo mostrava um Select VAZIO.
      const roles: AttachRoleOption[] = [{ Key: "", Text: "Origem", WarehouseCode: "" }];

      if (load.LoadType !== "Removal") {
        roles.push(...await this.loadTransshipmentRolesAsync(id));
      }

      this.targetModel().setData({
        // Placa e produto vão no TÍTULO em vez de num MessageStrip: a faixa comia a altura da
        // página e escondia a barra de rolagem horizontal da tabela de romaneios.
        title: `Vincular Romaneios — Carga ${load.Code as string} · Placa ${load.TruckCode as string}`
          + ` · Produto (${load.ItemCode as string}) ${load.ItemName as string}`,
        Key: id,
        Code: load.Code as string,
        LoadType: load.LoadType as string,
        TruckCode: load.TruckCode as string,
        ItemCode: load.ItemCode as string,
        BranchCode: load.BranchCode as string,
        role: "",
        roles,
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
   * Transbordos da carga com entrada JÁ REGISTRADA (GAC-1181, Task 11) — os únicos que
   * `ShipmentLoadsAttachTransactionsService#ValidateTransshipmentRoleAsync` aceita como papel de
   * uma saída vinculada; um transbordo sem entrada é recusado pela action com mensagem própria,
   * então nem entra aqui como opção.
   *
   * `$filter` como string crua, mesma convenção do resto do módulo: `EntryStorageTransactionKey`
   * é Edm.Guid nulável, mas `ne null` não precisa de escape (não há literal de string).
   */
  private async loadTransshipmentRolesAsync(loadKey: string): Promise<AttachRoleOption[]> {
    const binding = (this.getModel() as ODataModel).bindList(
      `/ShipmentLoads(${loadKey})/Transshipments`,
      undefined,
      undefined,
      undefined,
      {
        $filter: "EntryStorageTransactionKey ne null",
        $select: "Key,Sequence,WarehouseCode,WarehouseName",
        $orderby: "Sequence",
      }
    );

    const contexts = await binding.requestContexts(0, Infinity);

    return contexts.map(context => {
      const row = context.getObject() as {
        Key: string; Sequence?: number; WarehouseCode?: string; WarehouseName?: string;
      };

      return {
        Key: row.Key,
        Text: formatter.formatTransshipmentLabel(row),
        WarehouseCode: row.WarehouseCode ?? "",
      };
    });
  }

  onRoleChange(): void {
    this.applyShipmentFilters();
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
   *
   * GAC-1181, Task 11: o armazém só entra no escopo quando o papel selecionado é um TRANSBORDO —
   * a Origem segue sem restrição de armazém, como sempre foi
   * (`ShipmentLoadsAttachTransactionsService#EnsureNoneIsATransshipmentWarehouseAsync` é quem
   * barra, no servidor, o romaneio do armazém errado entrando como Origem).
   */
  private applyShipmentFilters(): void {
    const target = this.targetModel().getData() as Partial<TargetLoad>;

    const scope = [
      // GAC-1175: a carga Normal lista embarques; a de Remoção, recebimentos.
      `TransactionType eq '${expectedTransactionType(target.LoadType ?? "Normal")}'`,
      "TransactionStatus eq 'Confirmed'",
      "ShipmentLoadKey eq null",
      // GAC-1177 v2: a Original substituída por uma troca de liberação também fica com
      // ShipmentLoadKey nulo, mas não é reaproveitável — ela só existe para contexto
      // histórico, e ReplacedByShippingReleaseChangeKey eq null é o que a exclui daqui.
      // Já a Expedição NOVA gerada pela troca tem ShippingReleaseChangeKey preenchido e
      // PODE voltar a esta lista: se a carga de destino for cancelada ou o romaneio for
      // desvinculado, ela solta (ShipmentLoadKey volta a null) e precisa reaparecer na
      // Montagem para ser vinculada a outra carga — por isso não filtramos por
      // ShippingReleaseChangeKey.
      "ReplacedByShippingReleaseChangeKey eq null",
      `TruckCode eq '${(target.TruckCode ?? "").replace(/'/g, "''")}'`,
      `ItemCode eq '${(target.ItemCode ?? "").replace(/'/g, "''")}'`,
      `BranchCode eq '${(target.BranchCode ?? "").replace(/'/g, "''")}'`,
    ];

    // ⚠️ A restrição de armazém é do TRANSBORDO, não do papel em si: "Origem" também está em
    // `roles` (para o Select ter o item), mas com `WarehouseCode` vazio — testar só a existência
    // do papel geraria `WarehouseCode eq ''`, que não casa com nada e esvazia a lista.
    const role = (target.roles ?? []).find(r => r.Key === target.role);
    if (role?.WarehouseCode) {
      scope.push(`WarehouseCode eq '${role.WarehouseCode.replace(/'/g, "''")}'`);
    }

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
      // SEMPRE definido, nunca undefined (mesma regra da Refusal, Task 11): null é o papel
      // Origem — TransshipmentKey é Optional no EDM, mas `undefined` faz o JSON.stringify do
      // corpo omitir a chave e o OData recusar o corpo inteiro.
      action.setParameter("TransshipmentKey", target.role || null);

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
