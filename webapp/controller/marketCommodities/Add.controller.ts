import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import CommodityBaseController from "./CommodityBaseController";

/**
 * @namespace siagrob1.controller.marketCommodities
 */
export default class Add extends CommodityBaseController {
  /** Um só list binding de criação: um por visita acumularia bindings (e criados) no model. */
  private headerBinding?: ODataListBinding;

  onInit(): void {
    this.initModels(true);
    this.watchLeave("marketCommoditiesNew");
    this.getRouter().getRoute("marketCommoditiesNew").attachPatternMatched(() => void this.newRouteMatched());
  }

  private async newRouteMatched(): Promise<void> {
    const seq = this.leaveSeq;
    await this.prepare();
    if (seq !== this.leaveSeq) return;
    const model = this.getView().getModel() as ODataModel;
    const context = (this.headerBinding ??= model.bindList("/MarketCommodities")).create({
      Code: "", Name: "", HedgeExchange: "Cbot", Active: true,
    // bSkipRefresh = true: depois do POST em profundidade a UI5 releria as listas filhas; como o salvar já
    // navega para a edição, elas ficam sem contexto e a releitura estoura (mesma armadilha das corretoras).
    }, true, false, false);
    this.getView().setBindingContext(context);
    // Cadastro novo já nasce com os 12 meses de entrega (entrega no mês M → vencimento M, mesmo ano).
    this.fillMissingMonths(true);
  }

  onExit(): void {
    super.onExit();
    this.headerBinding?.destroy();
  }

  onSave(): Promise<void> {
    return this.save("commonSaved");
  }
}
