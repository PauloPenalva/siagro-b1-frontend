import BaseController from "../BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Table from "sap/m/Table";
import ListItemBase from "sap/m/ListItemBase";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ListBinding from "sap/ui/model/ListBinding";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import MarketLiveService from "siagrob1/services/MarketLiveService";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { connectionView, extractGroups, marketFetch, MarketResult, parseDecimalInput } from "siagrob1/helpers/MarketHelpers";
import { ManualQuoteInput, MarketQuote, MarketQuotesPayload } from "siagrob1/types/MarketQuote";

const ROUTE = "marketQuotesTerminal";

type ManualForm = {
  title: string; code: string;
  last: string; bid: string; ask: string; high: string; low: string; open: string;
  isSettlement: boolean;
};

/**
 * Terminal de cotações do módulo Mercado.
 *
 * Ciclo do SSE: a view é reaproveitada entre visitas, então os handlers de rota são presos UMA
 * vez no onInit. Entrar na rota abre o stream (`MarketLiveService.start` fecha o anterior antes);
 * qualquer outra rota (beforeRouteMatched) e o onExit fecham. Entrar → sair → entrar deixa
 * exatamente uma conexão aberta.
 *
 * @namespace siagrob1.controller.marketQuotesTerminal
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private manualDialog?: Dialog;
  private lastStatus: string = null;
  private lastMessage: string = null;
  private browserDisconnected = false;

  onInit(): void {
    this.getView().setModel(new JSONModel({
      quotes: [], groups: [], selectedGroup: "", selectedCode: "", selectedManual: false,
      statusText: "", statusState: "None", isAdmin: false, moduleDisabled: false,
    }), "quotes");
    this.getView().setModel(new JSONModel({}), "manual");

    this.getRouter().getRoute(ROUTE).attachPatternMatched(() => void this.enter());
    this.getRouter().attachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  onExit(): void {
    this.getRouter().detachBeforeRouteMatched(this.onBeforeRouteMatched, this);
    MarketLiveService.stop();
  }

  // Campo arrow (não getter): a mesma referência serve para attach e detach.
  private readonly onBeforeRouteMatched = (ev: Router$BeforeRouteMatchedEvent): void => {
    if (ev.getParameter("name") !== ROUTE) {
      MarketLiveService.stop();
    }
  };

  private model(): JSONModel {
    return this.getView().getModel("quotes") as JSONModel;
  }

  private text(key: string, args?: unknown[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  private async enter(): Promise<void> {
    this.bundle ??= await this.getResourceBundle();
    this.model().setProperty("/isAdmin", SessionService.hasRole("ADMIN"));
    this.model().setProperty("/moduleDisabled", false);
    this.browserDisconnected = false;

    // Carga inicial pelo REST: além de mostrar o quadro já, detecta o 404 do módulo desligado
    // (o EventSource não expõe o status HTTP).
    const board = await marketFetch<MarketQuote[]>("GET", ServerRoutes.marketQuotes);
    if (!board.ok) {
      if (board.status === 404) {
        this.model().setProperty("/moduleDisabled", true);
        return;
      }
      this.showError(board);
    } else {
      this.applyQuotes(board.data ?? []);
    }

    // A rota pode ter mudado enquanto o GET estava em voo.
    if (this.getRouter().getHashChanger().getHash() !== this.getRouter().getURL(ROUTE)) {
      return;
    }

    this.updateStatus();
    MarketLiveService.start({
      onData: (payload) => this.onPayload(payload),
      onConnectionChange: (disconnected) => {
        this.browserDisconnected = disconnected;
        this.updateStatus();
      },
    });
  }

  private onPayload(payload: MarketQuotesPayload): void {
    this.browserDisconnected = false;
    this.lastStatus = payload.status;
    this.lastMessage = payload.message;
    this.updateStatus();
    this.applyQuotes(payload.quotes ?? []);
  }

  private updateStatus(): void {
    const view = connectionView(this.lastStatus, this.browserDisconnected);
    this.model().setProperty("/statusText", this.text(view.textKey, [this.lastMessage ?? ""]));
    this.model().setProperty("/statusState", view.state);
  }

  /** Troca os dados no lugar; as abas só são reescritas quando a lista de grupos mudou. */
  private applyQuotes(quotes: MarketQuote[]): void {
    const model = this.model();
    const groups = extractGroups(quotes);
    const current = (model.getProperty("/groups") as { key: string }[]).map((g) => g.key);
    if (groups.join("\u0001") !== current.join("\u0001")) {
      model.setProperty("/groups", groups.map((g) => ({ key: g, text: g || this.text("marketGroupNone") })));
    }

    let selectedGroup = model.getProperty("/selectedGroup") as string;
    if (!groups.includes(selectedGroup)) {
      selectedGroup = groups[0] ?? "";
      model.setProperty("/selectedGroup", selectedGroup);
      this.applyGroupFilter(selectedGroup);
    }

    model.setProperty("/quotes", quotes);
    this.refreshSelectedManual();
  }

  private applyGroupFilter(group: string): void {
    const binding = this.byId("quotesTable").getBinding("items") as ListBinding;
    binding?.filter([new Filter("groupName", FilterOperator.EQ, group)]);
  }

  onGroupSelect(): void {
    this.applyGroupFilter(this.model().getProperty("/selectedGroup") as string);
    this.setSelectedCode("");
  }

  onSelectionChange(): void {
    const item = (this.byId("quotesTable") as Table).getSelectedItem();
    const code = item?.getBindingContext("quotes")?.getProperty("code") as string ;
    this.setSelectedCode(code ?? "");
  }

  /** Os itens são religados a cada evento; reaplica a seleção pela chave, não pela posição. */
  onTableUpdateFinished(): void {
    const table = this.byId("quotesTable") as Table;
    const code = this.model().getProperty("/selectedCode") as string;
    const match = table.getItems().find((i: ListItemBase) => i.getBindingContext("quotes")?.getProperty("code") === code);
    if (match) {
      table.setSelectedItem(match, true);
    } else {
      table.removeSelections(true);
    }
  }

  private setSelectedCode(code: string): void {
    this.model().setProperty("/selectedCode", code);
    this.refreshSelectedManual();
  }

  private selectedQuote(): MarketQuote  {
    const code = this.model().getProperty("/selectedCode") as string;
    return (this.model().getProperty("/quotes") as MarketQuote[]).find((q) => q.code === code);
  }

  private refreshSelectedManual(): void {
    const quote = this.selectedQuote();
    this.model().setProperty("/selectedManual", !!quote?.manualOverride);
  }

  async onManualQuote(): Promise<void> {
    const quote = this.selectedQuote();
    if (!quote) return;
    const show = (v: number): string => (v == null ? "" : String(v).replace(".", ","));
    const form: ManualForm = {
      title: this.text("marketManualQuoteTitle", [quote.code]), code: quote.code,
      last: show(quote.last), bid: show(quote.bid), ask: "", high: show(quote.high),
      low: show(quote.low), open: show(quote.open), isSettlement: false,
    };
    (this.getView().getModel("manual") as JSONModel).setData(form);
    this.manualDialog ??= await this.loadFragment({ name: "siagrob1.view.marketQuotesTerminal.fragments.ManualQuoteDialog" }) as Dialog;
    this.manualDialog.open();
  }

  onManualQuoteCancel(): void {
    this.manualDialog?.close();
  }

  async onManualQuoteSave(): Promise<void> {
    const form = (this.getView().getModel("manual") as JSONModel).getData() as ManualForm;
    const values = [form.last, form.bid, form.ask, form.high, form.low, form.open].map(parseDecimalInput);
    if (values[0] == null || values.some((v) => Number.isNaN(v))) {
      MessageBox.warning(this.text("marketManualQuoteInvalid"));
      return;
    }
    const [last, bid, ask, high, low, open] = values;
    const input: ManualQuoteInput = { last, bid, ask, high, low, open, isSettlement: !!form.isSettlement };

    this.setBusy(true);
    try {
      const result = await marketFetch("POST", ServerRoutes.marketManualQuote(form.code), input);
      if (!result.ok) {
        this.showError(result);
        return;
      }
      this.manualDialog?.close();
      MessageToast.show(this.text("marketManualQuoteSaved"));
    } finally {
      this.setBusy(false);
    }
  }

  async onReleaseQuote(): Promise<void> {
    const quote = this.selectedQuote();
    if (!quote?.manualOverride) return;
    if (!(await confirmDialog(this.text("marketReleaseConfirm", [quote.code]), this.text("marketReleaseQuote")))) return;

    const result = await marketFetch("POST", ServerRoutes.marketReleaseQuote(quote.code));
    if (!result.ok) {
      this.showError(result);
      return;
    }
    MessageToast.show(this.text("marketReleaseDone"));
  }

  async onReconnect(): Promise<void> {
    const result = await marketFetch("POST", ServerRoutes.marketCmaReconnect);
    if (!result.ok) {
      this.showError(result);
      return;
    }
    MessageToast.show(this.text("marketReconnectRequested"));
  }

  private showError(result: MarketResult): void {
    if (result.status === 404) {
      MessageBox.warning(this.text("marketModuleDisabled"));
      return;
    }
    MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }
}
