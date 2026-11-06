import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Sorter from "sap/ui/model/Sorter";
import Table from "sap/ui/table/Table";
import CommodityBaseController from "./CommodityBaseController";

/**
 * @namespace siagrob1.controller.marketCommodities
 */
export default class Edit extends CommodityBaseController {
  onInit(): void {
    this.initModels(false);
    this.watchLeave("marketCommoditiesEdit");
    // Só a edição ordena as listas filhas; na tela Nova o binding é puro (cabeçalho transitório).
    (this.byId("tableCommodityItems") as Table).bindRows({ path: "Items", sorter: new Sorter("ItemCode") });
    (this.byId("tableCommodityMonths") as Table).bindRows({
      path: "Months",
      sorter: new Sorter("DeliveryMonth"),
      events: {
        // Cadastro antigo com mapa incompleto: oferece os meses que faltam para o usuário completar.
        dataReceived: () => this.fillMissingMonths(),
      },
    });
    this.getRouter().getRoute("marketCommoditiesEdit").attachPatternMatched((ev) => void this.editRouteMatched(ev));
  }

  private async editRouteMatched(ev: Route$MatchedEvent): Promise<void> {
    const seq = this.leaveSeq;
    await this.prepare();
    if (seq !== this.leaveSeq) return;
    const { code } = ev.getParameter("arguments") as { code: string };
    // O roteador já entrega o argumento decodificado.
    const key = (code ?? "").trim();
    if (!key) {
      this.showNotFound();
      return;
    }
    // Chave string: aspas simples dobradas e codificação de URL - nada da URL vira sintaxe OData.
    const literal = encodeURIComponent(key.replace(/'/g, "''"));
    this.getView().bindElement({
      path: `/MarketCommodities('${literal}')`,
      events: {
        dataRequested: () => this.setBusy(true),
        dataReceived: (received: Event<{ error?: Error }>) => {
          this.setBusy(false);
          if (received.getParameter("error")) this.showNotFound();
        },
      },
    });
  }

  /** Código inválido ou registro inexistente: não deixa o registro anterior à vista. */
  private showNotFound(): void {
    this.getView().unbindElement(undefined);
    this.getView().setBindingContext(null);
    MessageBox.warning(this.text("marketCommodityNotFound"));
  }

  onSave(): Promise<void> {
    return this.save("commonUpdated");
  }
}
