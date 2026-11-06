import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import CounterpartyBaseController from "./CounterpartyBaseController";

/**
 * @namespace siagrob1.controller.marketCounterparties
 */
export default class Add extends CounterpartyBaseController {
  /** Um só list binding de criação: um por visita acumularia bindings (e criados) no model. */
  private headerBinding?: ODataListBinding;

  onInit(): void {
    this.initModels();
    this.watchLeave("marketCounterpartiesNew");
    this.getRouter().getRoute("marketCounterpartiesNew").attachPatternMatched(() => void this.newRouteMatched());
  }

  private async newRouteMatched(): Promise<void> {
    const seq = this.leaveSeq;
    await this.prepare();
    if (seq !== this.leaveSeq) return;
    const model = this.getView().getModel() as ODataModel;
    const context = (this.headerBinding ??= model.bindList("/MarketCounterparties")).create({
      Name: "", Type: "Broker", TaxId: "", Active: true,
    }, false, false, false);
    this.getView().setBindingContext(context);
  }

  onExit(): void {
    super.onExit();
    this.headerBinding?.destroy();
  }

  onSave(): Promise<void> {
    return this.save("commonSaved");
  }
}
