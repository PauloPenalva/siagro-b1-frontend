import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import PriceTableBaseController from "./PriceTableBaseController";

/**
 * @namespace siagrob1.controller.marketPriceTables
 */
export default class Edit extends PriceTableBaseController {
  onInit(): void {
    this.initModels();
    this.getRouter().getRoute("marketPriceTablesEdit").attachPatternMatched((ev) => void this.editRouteMatched(ev));
  }

  private async editRouteMatched(ev: Route$MatchedEvent): Promise<void> {
    await this.prepare();
    const { id } = ev.getParameter("arguments") as { id: string };
    // Chave inteira: qualquer outra coisa na URL não vira literal OData.
    if (!/^\d+$/.test(id ?? "")) return;
    this.getView().bindElement({
      path: `/MarketPriceTables(${id})`,
      events: {
        dataRequested: () => this.setBusy(true),
        dataReceived: () => this.setBusy(false),
      },
    });
  }

  onSave(): Promise<void> {
    return this.save("commonUpdated");
  }
}
