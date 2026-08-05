import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.customerReturns
 */
export default class Detail extends BaseController {
  formatter = { ...formatter }

  onInit(): void {
    this.getRouter().getRoute("customerReturnsDetail")
      .attachPatternMatched((ev) => this.detailRouteMatched(ev));
  }

  private detailRouteMatched(ev: Route$MatchedEvent) {
    const { id } = ev.getParameter("arguments") as { id: string };

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", false);
    uiModel.setProperty("/totalReturned", "0,000");

    if (id == null) {
      return;
    }

    // Expand explícito: a quebra apurada e a diferença da linha são calculadas a partir da
    // linha de ORIGEM. Sem trazê-la, vêm zero em silêncio e toda linha parece divergente.
    this.getView().bindElement({
      path: `/CustomerReturns(${id})`,
      parameters: {
        $expand: "Items($expand=SalesInvoiceItem($expand=SalesInvoice))",
      },
      events: {
        dataRequested: () => this.setBusy(true),
        dataReceived: () => {
          this.setBusy(false);
          this.refreshTotalReturned();
        },
      },
    });
  }
}
