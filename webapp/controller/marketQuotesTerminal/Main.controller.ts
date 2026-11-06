import BaseController from "../BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Table from "sap/ui/table/Table";
import MultiSelectionPlugin, { MultiSelectionPlugin$SelectionChangeEvent } from "sap/ui/table/plugins/MultiSelectionPlugin";
import Input from "sap/m/Input";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ListBinding from "sap/ui/model/ListBinding";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import SessionService from "siagrob1/services/SessionService";
import MarketLiveService from "siagrob1/services/MarketLiveService";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import {
  connectionView, deviationPercent, extractGroups, groupFromKey, groupKey, MANUAL_DEVIATION_LIMIT, marketFetch,
  FLASH_DURATION_MS, FLASH_FIELDS, flashedCells, MarketResult, normalizeQuotes, notFoundTextKey, parseDecimalInput, withFlashes, clearFlashes
} from "siagrob1/helpers/MarketHelpers";
import { ManualQuoteInput, MarketQuote, MarketQuoteRow, MarketQuotesPayload } from "siagrob1/types/MarketQuote";

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
  private filterPending = true;
  /** O "Último" só acusa obrigatório depois de mexido (ou no salvar), não ao abrir o diálogo vazio. */
  private manualLastTouched = false;
  /** Quadro anterior para comparar os preços; null = próximo quadro é linha de base (nada pisca). */
  private previousQuotes: MarketQuoteRow[] = null;
  /** >0 enquanto filtro/reposição mexem na seleção: eventos do plugin nesse intervalo não são do usuário. */
  private restoringSelection = 0;
  /** Descarta resultado assíncrono de setSelectedIndex quando uma reposição mais nova já começou. */
  private selectionSyncSeq = 0;
  private flashSeq = 0;
  /** Timer único que apaga as piscadas vencidas (quadros raros deixariam o atributo no DOM). */
  private flashTimer?: ReturnType<typeof setTimeout>;

  onInit(): void {
    this.getView().setModel(new JSONModel({
      quotes: [], groups: [], selectedGroup: "", moduleMessage: "", selectedCode: "", selectedManual: false,
      statusText: "", statusState: "None", isAdmin: false, canManage: false, moduleDisabled: false,
    }), "quotes");
    this.getView().setModel(new JSONModel({}), "manual");

    this.getRouter().getRoute(ROUTE).attachPatternMatched(() => void this.enter());
    this.getRouter().attachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  onExit(): void {
    this.getRouter().detachBeforeRouteMatched(this.onBeforeRouteMatched, this);
    this.cancelFlashTimer();
    MarketLiveService.stop();
  }

  // Campo arrow (não getter): a mesma referência serve para attach e detach.
  private readonly onBeforeRouteMatched = (ev: Router$BeforeRouteMatchedEvent): void => {
    if (ev.getParameter("name") !== ROUTE) {
      this.cancelFlashTimer();
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
    this.model().setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.model().setProperty("/moduleDisabled", false);
    this.browserDisconnected = false;
    // Na volta à rota a view é a mesma: reaplica o filtro da aba no primeiro quadro recebido.
    this.filterPending = true;

    // Carga inicial pelo REST: além de mostrar o quadro já, detecta o 404 do módulo desligado
    // (o EventSource não expõe o status HTTP).
    const board = await marketFetch<MarketQuote[]>("GET", ServerRoutes.marketQuotes);
    if (!board.ok) {
      if (board.status === 404) {
        this.model().setProperty("/moduleMessage", this.text(notFoundTextKey(board.moduleDisabled)));
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
    // Primeiro quadro de cada start() é linha de base: entrar na tela não faz nada piscar.
    this.previousQuotes = null;
    MarketLiveService.start<MarketQuotesPayload>(ServerRoutes.marketQuotesLive, {
      onData: (payload) => this.onPayload(payload),
      onConnectionChange: (disconnected) => {
        this.browserDisconnected = disconnected;
        // Queda do lado do navegador: o quadro da reconexão é nova linha de base.
        if (disconnected) this.previousQuotes = null;
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

  /**
   * Troca os dados no lugar; as abas só são reescritas quando a lista de grupos mudou. As abas seguem a
   * ordem do servidor (menor SortOrder do grupo) e a aba "Sem grupo" usa a chave sentinela.
   */
  private applyQuotes(rawQuotes: MarketQuote[]): void {
    const model = this.model();
    const normalized = normalizeQuotes(rawQuotes);
    const groups = extractGroups(normalized).map(groupKey);
    let refilter = this.filterPending;
    const current = (model.getProperty("/groups") as { key: string }[]).map((g) => g.key);
    if (groups.join("\u0001") !== current.join("\u0001")) {
      model.setProperty("/groups", groups.map((key) => ({ key, text: groupFromKey(key) || this.text("marketGroupNone") })));
      refilter = true;
    }

    let selectedGroup = model.getProperty("/selectedGroup") as string;
    if (!groups.includes(selectedGroup)) {
      selectedGroup = groups[0] ?? "";
      model.setProperty("/selectedGroup", selectedGroup);
      refilter = true;
    }
    // Idempotente: reaplicar o mesmo filtro é barato e evita aba mostrando grupo velho.
    if (refilter) {
      this.applyGroupFilter(selectedGroup);
      this.filterPending = false;
    }

    // Refiltro (aba nova/volta à rota) não pisca: as linhas recicladas mostrariam outra cotação.
    const rows = withFlashes(refilter ? null : this.previousQuotes, normalized, ++this.flashSeq, Date.now());
    this.previousQuotes = rows;
    model.setProperty("/quotes", rows);
    this.refreshSelectedManual();
    this.syncTableSelection();
    this.scheduleFlashExpiry();
  }

  private cancelFlashTimer(): void {
    clearTimeout(this.flashTimer);
    this.flashTimer = undefined;
  }

  /** Passada a duração da animação, limpa o atributo das linhas atuais (limpar não pisca: o atributo vira vazio). */
  private scheduleFlashExpiry(): void {
    this.cancelFlashTimer();
    this.flashTimer = setTimeout(() => {
      this.flashTimer = undefined;
      // Só os descritores, no lugar: o array de cotações não muda e o plugin de seleção não limpa a seleção.
      const model = this.model();
      const cells = flashedCells(model.getProperty("/quotes") as MarketQuoteRow[], FLASH_FIELDS);
      for (const { index, field } of cells) {
        model.setProperty(`/quotes/${index}/flash/${field}`, "");
        model.setProperty(`/quotes/${index}/flashAt/${field}`, 0);
      }
    }, FLASH_DURATION_MS);
  }

  private applyGroupFilter(key: string): void {
    const binding = this.byId("quotesTable").getBinding("rows") as ListBinding;
    // O filtro faz o plugin limpar a seleção e disparar selectionChange sem payload: não é o usuário.
    this.restoringSelection++;
    try {
      binding?.filter([new Filter("groupName", FilterOperator.EQ, groupFromKey(key))]);
    } finally {
      this.restoringSelection--;
    }
  }

  /** Zera as piscadas no modelo E no quadro anterior: nada limpo pode ser carregado adiante. */
  private clearAllFlashes(): void {
    const model = this.model();
    model.setProperty("/quotes", clearFlashes(model.getProperty("/quotes") as MarketQuoteRow[]));
    if (this.previousQuotes) this.previousQuotes = clearFlashes(this.previousQuotes);
  }

  onGroupSelect(): void {
    const model = this.model();
    this.clearAllFlashes();
    this.applyGroupFilter(model.getProperty("/selectedGroup") as string);
    this.setSelectedCode("");
    this.syncTableSelection();
  }

  onSelectionChange(ev: MultiSelectionPlugin$SelectionChangeEvent): void {
    // Seleção feita pelo próprio código (reposição após quadro/refiltro) não é escolha do usuário.
    if (this.restoringSelection > 0 || (ev.getParameter("customPayload") as { sync?: boolean })?.sync) return;
    const index = this.selection().getSelectedIndices()[0] ?? -1;
    const code = index < 0 ? "" : (this.byId("quotesTable") as Table).getContextByIndex(index)?.getProperty("code") as string;
    this.setSelectedCode(code ?? "");
  }

  private selection(): MultiSelectionPlugin {
    return this.byId("quotesSelection") as MultiSelectionPlugin;
  }

  /**
   * A grade seleciona por ÍNDICE: depois de cada quadro ou refiltro, reencontra a linha do código
   * selecionado; se ele não está na aba atual, limpa a seleção. O payload `sync` evita o laço.
   */
  private syncTableSelection(): void {
    const binding = this.byId("quotesTable")?.getBinding("rows") as ListBinding;
    const selection = this.selection();
    if (!binding || !selection) return;
    const code = this.model().getProperty("/selectedCode") as string;
    const contexts = code ? binding.getContexts(0, binding.getLength()) : [];
    const index = contexts.findIndex((c) => c?.getProperty("code") === code);
    const current = selection.getSelectedIndices()[0] ?? -1;
    const seq = ++this.selectionSyncSeq;
    if (index < 0) {
      if (current >= 0) selection.clearSelection({ sync: true });
      if (code) this.setSelectedCode("");
    } else if (current !== index) {
      selection.setSelectedIndex(index, { sync: true })
        .then(() => {
          // Uma reposição mais nova pode ter começado enquanto esta esperava o contexto: descarta.
          if (seq !== this.selectionSyncSeq) return;
          const selected = selection.getSelectedIndices()[0] ?? -1;
          const table = this.byId("quotesTable") as Table;
          const selectedCode = selected < 0 ? "" : table.getContextByIndex(selected)?.getProperty("code") as string;
          if (selectedCode !== this.model().getProperty("/selectedCode")) this.syncTableSelection();
        })
        .catch(() => { /* contexto indisponível: a próxima atualização tenta de novo */ });
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
    this.manualLastTouched = false;
    this.manualDialog.open();
    this.validateManualFields(form, false);
  }

  /** Marca cada campo do diálogo enquanto se digita (número inválido; Último vazio só depois de mexido). */
  onManualFieldChange(ev: { getSource: () => Input }): void {
    if (ev?.getSource?.() === this.byId("manualLast")) this.manualLastTouched = true;
    this.validateManualFields((this.getView().getModel("manual") as JSONModel).getData() as ManualForm, this.manualLastTouched);
  }

  /** Devolve os números na ordem último, compra, venda, máxima, mínima, abertura; null se algum for inválido. */
  private validateManualFields(form: ManualForm, requireLast = true): number[] {
    const fields: ("last" | "bid" | "ask" | "high" | "low" | "open")[] = ["last", "bid", "ask", "high", "low", "open"];
    const ids = ["manualLast", "manualBid", "manualAsk", "manualHigh", "manualLow", "manualOpen"];
    let valid = true;
    const values = fields.map((field, i) => {
      const value = parseDecimalInput(form[field]);
      const input = this.byId(ids[i]) as Input;
      let error = "";
      if (Number.isNaN(value)) error = this.text("marketInvalidNumber");
      else if (field === "last" && value == null && requireLast) error = this.text("marketRequiredField");
      else if (field === "last" && value == null) valid = false;
      input?.setValueState(error ? "Error" : "None");
      input?.setValueStateText(error);
      if (error) valid = false;
      return value;
    });
    return valid ? values : null;
  }

  onManualQuoteCancel(): void {
    this.manualDialog?.close();
  }

  async onManualQuoteSave(): Promise<void> {
    const form = (this.getView().getModel("manual") as JSONModel).getData() as ManualForm;
    const values = this.validateManualFields(form);
    if (!values) {
      MessageBox.warning(this.text("marketManualQuoteInvalid"));
      return;
    }
    const [last, bid, ask, high, low, open] = values;
    const input: ManualQuoteInput = { last, bid, ask, high, low, open, isSettlement: !!form.isSettlement };

    // Protege contra "1.188" querendo dizer 1188: desvio grande do último pede confirmação.
    const previous = (this.model().getProperty("/quotes") as MarketQuote[]).find((q) => q.code === form.code)?.last;
    const deviation = deviationPercent(last, previous);
    if (deviation != null && deviation > MANUAL_DEVIATION_LIMIT) {
      const fmt = (v: number): string => v.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
      const message = this.text("marketManualDeviationConfirm", [fmt(last), deviation.toFixed(0), fmt(previous)]);
      if (!(await confirmDialog(message, this.text("marketManualQuote")))) return;
    }

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
      MessageBox.warning(this.text(notFoundTextKey(result.moduleDisabled)));
      return;
    }
    MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }
}
