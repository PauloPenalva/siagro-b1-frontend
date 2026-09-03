import { ListItemBase$PressEvent } from "sap/m/ListItemBase";
import List from "sap/m/List";
import { ListBase$UpdateFinishedEvent } from "sap/m/ListBase";
import JSONModel from "sap/ui/model/json/JSONModel";
import Sorter from "sap/ui/model/Sorter";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/** As raias do painel, na ordem em que a carga anda. */
const LANES = [
  { id: "listPlanned", status: "Planned", count: "countPlanned" },
  { id: "listOpen", status: "Open", count: "countOpen" },
  { id: "listPartiallyInvoiced", status: "PartiallyInvoiced", count: "countPartiallyInvoiced" },
  { id: "listInvoiced", status: "Invoiced", count: "countInvoiced" },
  { id: "listReturned", status: "Returned", count: "countReturned" },
];

/**
 * Painel diário das cargas.
 *
 * Somente leitura: a situação é derivada do saldo faturado, então não há o que gravar ao mover
 * um cartão. Clicar abre o detalhe da carga, onde as ações existem.
 *
 * @namespace siagrob1.controller.shipmentLoads
 */
export default class Panel extends BaseController {

  formatter = formatter;

  private _branchesLoaded = false;

  onInit(): void {
    this.getView().setModel(new JSONModel([]), "branches");
    this.getView().setModel(new JSONModel({
      date: new Date().toISOString().slice(0, 10),
      branchCode: "",
    }), "panel");

    this.getRouter().getRoute("shipmentLoadsPanel")
      .attachPatternMatched(() => {
        // this.getModel() só resolve o OData model depois que a rota casa.
        if (!this._branchesLoaded) {
          this._branchesLoaded = true;
          void this.loadBranches();
        }
        this.applyFilters();
      });
  }

  /**
   * JSONModel estático em vez de bind direto em `/Branchs`: mesmo motivo documentado no
   * controller da Montagem de Carga — a FilterBar/Select com binding suspenso estoura
   * "Cannot resume a not suspended binding" no segundo render.
   */
  private async loadBranches(): Promise<void> {
    const oModel = this.getModel() as ODataModel;
    const contexts = await oModel.bindList("/Branchs", undefined, [new Sorter("Code")])
      .requestContexts(0, 100);
    const branches = contexts.map(ctx => ctx.getObject() as { Code: string; ShortName: string });
    (this.getView().getModel("branches") as JSONModel).setData(branches);
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  onRefresh(): void {
    this.applyFilters();
  }

  /**
   * Uma raia, um `$filter`.
   *
   * O status entra como string crua no `$filter`, e não via `sap.ui.model.Filter`: filtro de
   * enum monta o literal errado no V4 e estoura "Unsupported type".
   */
  private applyFilters(): void {
    const panel = (this.getModel("panel") as JSONModel).getData() as {
      date?: string, branchCode?: string,
    };

    LANES.forEach((lane) => {
      const list = this.byId(lane.id) as List;
      const binding = list?.getBinding("items") as ODataListBinding;

      if (!binding) return;

      const filters = [`Status eq '${lane.status}'`];

      if (panel.date) {
        // LoadDate é datetime: o dia inteiro precisa de um intervalo, não de igualdade.
        filters.push(`LoadDate ge ${panel.date}T00:00:00Z`);
        filters.push(`LoadDate le ${panel.date}T23:59:59Z`);
      }

      if (panel.branchCode) {
        filters.push(`BranchCode eq '${panel.branchCode.replace(/'/g, "''")}'`);
      }

      binding.changeParameters({ $filter: filters.join(" and ") });
      binding.refresh();
    });
  }

  /**
   * Atualiza o contador do cabeçalho da raia.
   *
   * Vem do evento da lista, e não de um `requestContexts` logo após o `refresh()`: o refresh é
   * assíncrono, então ler o binding na sequência devolve o estado ANTERIOR — na primeira carga,
   * zero. O sintoma era um painel com cartões e todas as raias marcando "(0)".
   */
  onLaneUpdated(ev: ListBase$UpdateFinishedEvent): void {
    const lane = LANES.find(l => ev.getSource().getId().endsWith(`--${l.id}`));

    if (!lane) return;

    (this.getModel("panel") as JSONModel)
      .setProperty(`/${lane.count}`, ev.getParameter("total"));
  }

  onOpenLoad(ev: ListItemBase$PressEvent): void {
    const ctx = ev.getSource().getBindingContext() as Context;
    this.navTo("shipmentLoadsDetail", { id: ctx.getProperty("Key") as string });
  }
}
