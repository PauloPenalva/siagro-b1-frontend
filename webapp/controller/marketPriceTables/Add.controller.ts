import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import PriceTableBaseController from "./PriceTableBaseController";

/**
 * @namespace siagrob1.controller.marketPriceTables
 */
export default class Add extends PriceTableBaseController {
  onInit(): void {
    this.initModels();
    this.getRouter().getRoute("marketPriceTablesNew").attachPatternMatched(() => void this.newRouteMatched());
  }

  private async newRouteMatched(): Promise<void> {
    await this.prepare();
    const model = this.getView().getModel() as ODataModel;
    const context = model.bindList("/MarketPriceTables").create({
      Description: "", ItemCode: "", ItemName: "", HarvestSeasonCode: "", Active: true,
    }, false, false, false);
    this.getView().setBindingContext(context);
  }

  onSave(): Promise<void> {
    return this.save("commonSaved");
  }
}
