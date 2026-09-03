import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import Sorter from "sap/ui/model/Sorter";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/** Carga selecionada na lista, com o mínimo que as ações precisam. */
type SelectedLoad = {
  Key: string,
  Code: string,
  Status: string,
}

/** Situações da carga oferecidas no filtro — mesmos rótulos de formatter.formatShipmentLoadStatus. */
const SHIPMENT_LOAD_STATUSES = [
  { key: "Planned", text: "Planejada" },
  { key: "Open", text: "Carregada" },
  { key: "PartiallyInvoiced", text: "Faturada Parcial" },
  { key: "Invoiced", text: "Faturada" },
  { key: "Returned", text: "Devolvida" },
  { key: "Cancelled", text: "Cancelada" },
];

/**
 * Montagem de Carga.
 *
 * O fluxo é: a Logística CRIA a carga (botão Nova Carga) e os romaneios de embarque são
 * VINCULADOS depois, na página `Attach`. O caminho inverso — montar a carga a partir de uma
 * seleção de romaneios — não existe mais.
 *
 * O formulário mora nas páginas `Add`/`Edit` e a vinculação na `Attach`; aqui fica só a lista.
 *
 * @namespace siagrob1.controller.shipmentLoads
 */
export default class Main extends BaseController {

  formatter = formatter;

  private _branchesLoaded = false;

  onInit(): void {
    // Status nasce como array porque o filtro é multi-seleção: com `undefined` o selectedKeys do
    // MultiComboBox não teria onde gravar.
    this.getView().setModel(new JSONModel({ Status: [] }), "filterLoads");
    this.getView().setModel(new JSONModel({ items: SHIPMENT_LOAD_STATUSES }), "loadStatuses");
    this.getView().setModel(new JSONModel([]), "branches");

    this.getRouter().getRoute("shipmentLoads")
      .attachPatternMatched(() => {
        // this.getModel() só resolve o OData model depois que a rota casa (onInit é cedo demais).
        if (!this._branchesLoaded) {
          this._branchesLoaded = true;
          void this.loadBranches();
        }
        this.applyLoadFilters();
        // Voltando das páginas de Nova Carga / Editar / Vincular Romaneios, o filtro é o mesmo de antes: sem filtro
        // novo o binding não refaz o request e a carga recém-gravada não apareceria.
        this.refreshLoads();
      });
  }

  /**
   * O Select de Filial do filtro de Cargas carrega a lista UMA vez num JSONModel estático, em vez
   * de bind direto em `/Branchs` com `suspended: true`: a sap.ui.comp.filterbar.FilterBar resume()
   * incondicionalmente o binding suspenso de um Select toda vez que a filterbar volta a ficar
   * visível, mas nunca o suspende de novo — na segunda exibição o resume() da vendor lib estoura
   * "Cannot resume a not suspended binding" NO MEIO do onBeforeRendering e aborta o render —
   * sintoma: a tela não atualiza. Tentar resuspender o
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

  onSearchLoadFilters(): void {
    this.applyLoadFilters();
  }

  onClearLoadFilters(): void {
    (this.getModel("filterLoads") as JSONModel).setData({ Status: [] });
    this.applyLoadFilters();
  }

  /**
   * Monta o `$filter` a partir do modelo de filtro da tela e o aplica como parâmetro estático do
   * binding. `exactMatchFields` cobre enum/status e código de filial — comparados com `eq` em
   * string crua, porque `sap.ui.model.Filter` sobre enum estoura "Unsupported type" (o modelo V4
   * não serializa o literal). Os demais campos entram com `contains`, e `DateFrom`/`DateTo` viram
   * `ge`/`le` sobre `dateProperty`.
   *
   * Um valor em ARRAY (filtro multi-seleção, como a Situação da carga) vira um grupo de `or`
   * PARENTIZADO: os pedaços são unidos com `and` no fim, e um `or` solto capturaria os demais
   * filtros. Array vazio = sem restrição.
   */
  private applyFilters(
    tableId: string,
    filterModelName: string,
    dateProperty: string,
    exactMatchFields: string[],
    fixedScope: string[] = [],
  ): void {
    const table = this.byId(tableId) as Table;
    const binding = table?.getBinding("rows") as ODataListBinding;

    // O patternMatched roda antes de a tabela existir na primeira exibição da rota.
    if (!binding) return;

    const filterData = ((this.getModel(filterModelName) as JSONModel)?.getData()
      ?? {}) as Record<string, string | string[]>;
    const filters: string[] = [...fixedScope];

    Object.keys(filterData).forEach((key) => {
      const value = filterData[key];
      if (!value) return;

      if (Array.isArray(value)) {
        const ors = value.map((v) => `${key} eq '${String(v).replace(/'/g, "''")}'`);
        if (ors.length === 0) return;
        filters.push(ors.length === 1 ? ors[0] : `(${ors.join(" or ")})`);
        return;
      }

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

  /** Carga cancelada continua listada: é histórico, e some só do faturamento. */
  private applyLoadFilters(): void {
    this.applyFilters("shipmentLoadsTable", "filterLoads", "LoadDate",
      ["Status", "BranchCode", "TruckDriverCode", "CarrierCardCode", "WarehouseCode"]);
  }

  // ---------------------------------------------------------------- criação e edição

  onNewLoad(): void {
    this.navTo("shipmentLoadsNew");
  }

  onEditLoad(): void {
    const load = this.selectedLoad();

    if (!load) {
      MessageBox.warning("Selecione uma carga.");
      return;
    }

    if (load.Status === "Cancelled") {
      MessageBox.warning("Carga cancelada não pode ser alterada.");
      return;
    }

    this.navTo("shipmentLoadsEdit", { id: load.Key });
  }

  async onDeleteLoad(): Promise<void> {
    const load = this.selectedLoad();

    if (!load) {
      MessageBox.warning("Selecione uma carga.");
      return;
    }

    if (load.Status !== "Planned") {
      MessageBox.warning(
        "Somente uma carga apenas planejada pode ser excluída. Cancele a carga em vez de excluí-la.");
      return;
    }

    if (!await DialogHelper.confirmDialog(`Excluir a carga ${load.Code} ?`)) return;

    const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsDelete(...)");
    action.setParameter("Key", load.Key);

    this.setBusy(true);
    try {
      await action.invoke();
      this.refreshLoads();
      MessageToast.show("Carga excluída.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  // ---------------------------------------------------------------- vinculação

  /**
   * Leva o usuário para a página de vinculação. A carga vai na URL porque é ela que define
   * placa, produto e filial aceitos — sem carga alvo não há lista de romaneios a mostrar.
   */
  onGoToAttach(): void {
    const load = this.selectedLoad();

    if (!load) {
      MessageBox.warning("Selecione uma carga.");
      return;
    }

    if (load.Status !== "Planned" && load.Status !== "Open") {
      MessageBox.warning(
        `A carga ${load.Code} já foi faturada ou cancelada e não aceita novos romaneios.`);
      return;
    }

    this.navTo("shipmentLoadsAttach", { id: load.Key });
  }

  async onCancelLoad(): Promise<void> {
    const load = this.selectedLoad();

    if (!load) {
      MessageBox.warning("Selecione uma carga.");
      return;
    }

    const reason = await DialogHelper.promptDialog(
      "Cancelar Carga", "Informe o motivo do cancelamento:");

    if (!reason) return;

    const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsCancel(...)");
    action.setParameter("Key", load.Key);
    action.setParameter("CancellationReason", reason);

    this.setBusy(true);
    try {
      await action.invoke();
      this.refreshLoads();
      MessageToast.show("Carga cancelada. Romaneios devolvidos à montagem.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  onOpenDetail(): void {
    const load = this.selectedLoad();

    if (!load) {
      MessageBox.warning("Selecione uma carga.");
      return;
    }

    this.navTo("shipmentLoadsDetail", { id: load.Key });
  }

  private selectedLoad(): SelectedLoad {
    const table = this.byId("shipmentLoadsTable") as Table;
    const selected = table?.getSelectedIndices() ?? [];

    if (selected.length !== 1) return undefined;

    const ctx = table.getContextByIndex(selected[0]) as Context;

    return {
      Key: ctx.getProperty("Key") as string,
      Code: ctx.getProperty("Code") as string,
      Status: ctx.getProperty("Status") as string,
    };
  }

  private refreshLoads(): void {
    const binding = (this.byId("shipmentLoadsTable") as Table)
      ?.getBinding("rows") as ODataListBinding;
    binding?.refresh();
  }
}
