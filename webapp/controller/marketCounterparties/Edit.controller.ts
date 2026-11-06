import MessageBox from "sap/m/MessageBox";
import Event from "sap/ui/base/Event";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Sorter from "sap/ui/model/Sorter";
import Table from "sap/ui/table/Table";
import CounterpartyBaseController from "./CounterpartyBaseController";

/**
 * @namespace siagrob1.controller.marketCounterparties
 */
export default class Edit extends CounterpartyBaseController {
  onInit(): void {
    this.initModels();
    this.watchLeave("marketCounterpartiesEdit");
    // Só a edição ordena as contas por código; na tela Nova o binding é puro (cabeçalho transitório).
    (this.byId("tableCounterpartyAccounts") as Table).bindRows({ path: "Accounts", sorter: new Sorter("Code") });
    this.getRouter().getRoute("marketCounterpartiesEdit").attachPatternMatched((ev) => void this.editRouteMatched(ev));
  }

  private async editRouteMatched(ev: Route$MatchedEvent): Promise<void> {
    const seq = this.leaveSeq;
    await this.prepare();
    if (seq !== this.leaveSeq) return;
    const { id } = ev.getParameter("arguments") as { id: string };
    // Chave inteira: qualquer outra coisa na URL não vira literal OData.
    if (!/^\d+$/.test(id ?? "")) {
      this.showNotFound();
      return;
    }
    this.getView().bindElement({
      path: `/MarketCounterparties(${id})`,
      events: {
        dataRequested: () => this.setBusy(true),
        dataReceived: (received: Event<{ error?: Error }>) => {
          this.setBusy(false);
          if (received.getParameter("error")) this.showNotFound();
        },
      },
    });
  }

  /** Id inválido ou registro inexistente: não deixa o registro anterior à vista. */
  private showNotFound(): void {
    this.getView().unbindElement(undefined);
    this.getView().setBindingContext(null);
    MessageBox.warning(this.text("marketCounterpartyNotFound"));
  }

  onSave(): Promise<void> {
    return this.save("commonUpdated");
  }
}
