import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import { IconTabBar$SelectEvent } from "sap/m/IconTabBar";
import Sorter from "sap/ui/model/Sorter";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { Input$LiveChangeEvent } from "sap/m/Input";
import BaseController from "../BaseController";
import { pickPurchaseContract, pickSalesContract, syncContractLink } from "siagrob1/helpers/MarketContractLink";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { MarketResult, marketFetch, notFoundTextKey, parseServerInstant } from "siagrob1/helpers/MarketHelpers";
import {
  FuturesTradesFilter, TradeField, TradeForm, TradeFormErrors, accountOptions, buildFuturesTradesFilter,
  buildTradePayload, defaultRealizedPeriod, defaultTradesFilter, equivalentHint,
  reasonTextKey, sideTextKey, toCamel, totalView, totalsByCurrency, tradeActions
} from "siagrob1/helpers/MarketHedgeHelpers";
import { loadCounterparties, loadMarketLookups } from "siagrob1/helpers/MarketLookups";
import { formatStrictDecimal, MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import {
  MarketFuturesPosition, MarketFuturesRealized, MarketFuturesTrade, MarketLotInfo
} from "siagrob1/types/MarketHedges";

type TabKey = "trades" | "positions" | "realized";

/** Id do controle do diálogo que carrega o estado de erro de cada campo. */
const FIELD_CONTROL: Record<TradeField, string> = {
  tradedAt: "tradeDateTime", accountId: "tradeAccount", instrumentCode: "tradeInstrument", side: "tradeSide",
  lots: "tradeLots", price: "tradePrice", fees: "tradeFees",
};

type Markable = { setValueState(state: "None" | "Error"): unknown; setValueStateText(text: string): unknown };

/** Estado do diálogo da operação: `TradeForm` + o que a tela mostra. */
type TradeDialogModel = TradeForm & {
  title: string;
  isNew: boolean;
  /** Contas oferecidas: só ativas na inclusão; todas na alteração (a atual pode estar inativa). */
  accounts: { id: string; label: string }[];
  /** Código do contrato vinculado (só exibição), um por tipo. */
  purchaseContractCode: string;
  salesContractCode: string;
  /** Toneladas (ou US$) equivalentes aos lotes digitados. */
  equivalent: string;
};

/**
 * Operações de bolsa: operações (OData `MarketFuturesTrades`, só leitura; gravação por REST), posição aberta
 * e resultado realizado (REST). O sistema só REGISTRA: nada aqui envia ordem a corretora.
 *
 * @namespace siagrob1.controller.marketFuturesTrades
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private tradeDialog?: Dialog;
  private dayDialog?: Dialog;
  /** Id da operação em alteração; nulo = inclusão. */
  private editingId: number = null;
  private visited = false;
  private readonly lotInfoCache = new Map<string, Promise<MarketLotInfo>>();
  /** Descarta resposta de `lot-info` de uma digitação que já foi superada. */
  private lotInfoSeq = 0;

  /** Textos de enum (campos de instância, não getters: o UI5 resolve `.sideText` por nome). */
  sideText = (side: string): string => (side ? this.text(sideTextKey(side)) : "");
  reasonText = (reason: string): string => (reason ? this.text(reasonTextKey(reason)) : "");

  onInit(): void {
    this.getView().setModel(new JSONModel({ canManage: false, tab: "trades" }), "view");
    this.getView().setModel(new JSONModel(defaultTradesFilter(new Date())), "filter");
    this.getView().setModel(new JSONModel({ accountsAll: [], accountsActive: [], futures: [] }), "lookup");
    this.getView().setModel(new JSONModel(this.noSelection()), "sel");
    this.getView().setModel(new JSONModel({ busy: false, rows: [], totals: [] }), "positions");
    const period = defaultRealizedPeriod(new Date());
    this.getView().setModel(new JSONModel({ busy: false, rows: [], totals: [], from: period.from, to: period.to }), "realized");
    this.getView().setModel(new JSONModel({}), "trade");
    this.getView().setModel(new JSONModel({ accountId: "", date: "" }), "day");
    this.getRouter().getRoute("marketFuturesTrades").attachPatternMatched(() => void this.routeMatched());
  }

  private noSelection() {
    return { ...tradeActions(undefined, false), has: false, editTooltip: "" };
  }

  private async routeMatched(): Promise<void> {
    this.viewModel().setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    const model = this.getView().getModel() as ODataModel;
    const [counterparties, lookups] = await Promise.all([loadCounterparties(model), loadMarketLookups(model, true, false)]);
    const lookup = this.getView().getModel("lookup") as JSONModel;
    lookup.setProperty("/accountsAll", accountOptions(counterparties, "Broker", false));
    lookup.setProperty("/accountsActive", accountOptions(counterparties, "Broker", true));
    lookup.setProperty("/futures", lookups.instruments.filter((instrument) => instrument.Type === "Future"));

    const revisit = this.visited;
    this.visited = true;
    if (revisit) this.binding()?.refresh();
    else this.bindTrades();
    const tab = this.viewModel().getProperty("/tab") as TabKey;
    if (tab !== "trades") void this.loadTab(tab);
  }

  private text(key: string, args?: string[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  private viewModel(): JSONModel {
    return this.getView().getModel("view") as JSONModel;
  }

  private filterModel(): JSONModel {
    return this.getView().getModel("filter") as JSONModel;
  }

  private tradeModel(): JSONModel {
    return this.getView().getModel("trade") as JSONModel;
  }

  private table(): Table {
    return this.byId("tableFuturesTrades") as Table;
  }

  private binding(): ODataListBinding {
    return this.table().getBinding("rows") as ODataListBinding;
  }

  /** As linhas só são ligadas com o bundle resolvido: `sideText`/`reasonText` leem `this.bundle`. */
  private bindTrades(): void {
    this.table().bindRows({
      path: "/MarketFuturesTrades",
      parameters: {
        $select: "Id,TradedAt,TradeDate,AccountId,InstrumentCode,Side,Lots,Price,Fees,FeesCurrency,Reason,BrokerReference,"
          + "OpenLots,Confirmed,PurchaseContractKey,SalesContractKey,ContractCode,EfpId,Notes",
        $expand: "Account($select=Code;$expand=Counterparty($select=Name)),Instrument($select=Code,QuoteUnit,ContractSize,TonFactor)",
        $filter: buildFuturesTradesFilter(this.filterModel().getData() as FuturesTradesFilter),
      },
      sorter: [new Sorter("TradedAt", true), new Sorter("Id", true)],
    });
  }

  // -------------------------------------------------------------------------------------------
  // Abas
  // -------------------------------------------------------------------------------------------

  onTabSelect(ev: IconTabBar$SelectEvent): void {
    const key = ev.getParameter("key") as TabKey;
    if (key !== "trades") void this.loadTab(key);
  }

  private loadTab(tab: TabKey): Promise<void> {
    return tab === "positions" ? this.loadPositions() : tab === "realized" ? this.loadRealized() : Promise.resolve();
  }

  private showError(result: MarketResult): void {
    if (result.status === 404) {
      MessageBox.warning(this.text(notFoundTextKey(result.moduleDisabled === true)));
      return;
    }
    // 400/403 chegam em texto pt-BR do servidor: mostrados como recebidos.
    MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }

  async onRefreshPositions(): Promise<void> {
    await this.loadPositions();
  }

  private async loadPositions(): Promise<void> {
    const model = this.getView().getModel("positions") as JSONModel;
    model.setProperty("/busy", true);
    try {
      const result = await marketFetch<MarketFuturesPosition[]>("GET", ServerRoutes.marketFuturesPositions);
      if (!result.ok) {
        this.showError(result);
        return;
      }
      const rows = result.data ?? [];
      model.setProperty("/rows", rows);
      model.setProperty("/totals", totalsByCurrency(rows, "unrealizedPnl").map(totalView));
    } finally {
      model.setProperty("/busy", false);
    }
  }

  async onRefreshRealized(): Promise<void> {
    await this.loadRealized();
  }

  private async loadRealized(): Promise<void> {
    const model = this.getView().getModel("realized") as JSONModel;
    const from = model.getProperty("/from") as string, to = model.getProperty("/to") as string;
    if (!from || !to || from > to) {
      MessageBox.warning(this.text("marketFuturesPeriodInvalid"));
      return;
    }
    model.setProperty("/busy", true);
    try {
      const result = await marketFetch<MarketFuturesRealized[]>("GET", ServerRoutes.marketFuturesRealized(from, to));
      if (!result.ok) {
        this.showError(result);
        return;
      }
      const rows = result.data ?? [];
      model.setProperty("/rows", rows);
      model.setProperty("/totals", totalsByCurrency(rows, "realizedPnl").map(totalView));
    } finally {
      model.setProperty("/busy", false);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Aba Operações: filtro, seleção, ações
  // -------------------------------------------------------------------------------------------

  onSearch(): void {
    this.binding()?.changeParameters({ $filter: buildFuturesTradesFilter(this.filterModel().getData() as FuturesTradesFilter) });
  }

  onClearFilters(): void {
    this.filterModel().setData(defaultTradesFilter(new Date()));
    this.onSearch();
  }

  onRefresh(): void {
    this.binding()?.refresh();
  }

  private selectedContext(): Context {
    return this.getSelectRowContext(this.table());
  }

  private selectedTrade(): MarketFuturesTrade {
    return this.selectedContext()?.getObject() as MarketFuturesTrade;
  }

  /** Recalcula quais botões a linha selecionada aceita (chamado na seleção e a cada atualização das linhas). */
  onSelectionChange(): void {
    const trade = this.selectedTrade();
    const actions = tradeActions(trade, this.viewModel().getProperty("/canManage") as boolean);
    const next = { ...actions, has: !!trade, editTooltip: actions.blockedKey ? this.text(actions.blockedKey) : "" };
    const sel = this.getView().getModel("sel") as JSONModel;
    if (JSON.stringify(sel.getData()) !== JSON.stringify(next)) sel.setData(next);
  }

  async onConfirm(): Promise<void> {
    await this.postOnSelected((id) => ServerRoutes.marketFuturesTradeConfirm(id), "marketFuturesConfirmed");
  }

  async onUnconfirm(): Promise<void> {
    await this.postOnSelected((id) => ServerRoutes.marketFuturesTradeUnconfirm(id), "marketFuturesUnconfirmed");
  }

  private async postOnSelected(url: (id: number) => string, successKey: string): Promise<void> {
    const trade = this.selectedTrade();
    if (!trade) {
      MessageBox.alert(this.text("marketFuturesSelectTrade"));
      return;
    }
    this.setBusy(true);
    try {
      const result = await marketFetch("POST", url(trade.Id));
      if (!result.ok) {
        this.showError(result);
        return;
      }
      MessageToast.show(this.text(successKey));
      this.binding()?.refresh();
    } finally {
      this.setBusy(false);
    }
  }

  async onDelete(): Promise<void> {
    const trade = this.selectedTrade();
    if (!trade) {
      MessageBox.alert(this.text("commonSelectToDelete"));
      return;
    }
    if (!tradeActions(trade, true).canDelete) {
      MessageBox.alert(this.text(tradeActions(trade, true).blockedKey));
      return;
    }
    if (!(await confirmDialog(this.text("commonDeleteConfirm"), this.text("commonDelete")))) return;

    this.setBusy(true);
    try {
      const result = await marketFetch("DELETE", ServerRoutes.marketFuturesTrade(trade.Id));
      if (!result.ok) {
        this.showError(result);
        return;
      }
      MessageToast.show(this.text("commonDeleted"));
      this.binding()?.refresh();
    } finally {
      this.setBusy(false);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Conferir o dia
  // -------------------------------------------------------------------------------------------

  async onConfirmDay(): Promise<void> {
    (this.getView().getModel("day") as JSONModel).setData({
      accountId: (this.filterModel().getProperty("/AccountId") as string) ?? "", date: localIsoDate(new Date()),
    });
    this.dayDialog ??= await this.loadFragment({ name: "siagrob1.view.marketFuturesTrades.fragments.ConfirmDayDialog" }) as Dialog;
    this.dayDialog.open();
  }

  onDayCancel(): void {
    this.dayDialog?.close();
  }

  async onDaySave(): Promise<void> {
    const form = (this.getView().getModel("day") as JSONModel).getData() as { accountId: string; date: string };
    if (!form.accountId || !form.date) {
      MessageBox.warning(this.text("marketFuturesConfirmDayInvalid"));
      return;
    }
    this.setBusy(true);
    try {
      const result = await marketFetch<{ confirmed: number }>("POST", ServerRoutes.marketFuturesConfirmDay, {
        accountId: Number(form.accountId), date: form.date,
      });
      if (!result.ok) {
        this.showError(result);
        return;
      }
      this.dayDialog?.close();
      MessageToast.show(this.text("marketFuturesConfirmedDay", [String(result.data?.confirmed ?? 0)]));
      this.binding()?.refresh();
    } finally {
      this.setBusy(false);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Diálogo da operação
  // -------------------------------------------------------------------------------------------

  private async openTradeDialog(form: TradeDialogModel, id: number): Promise<void> {
    this.editingId = id;
    this.lotInfoCache.clear();
    this.tradeModel().setData(form);
    this.tradeDialog ??= await this.loadFragment({ name: "siagrob1.view.marketFuturesTrades.fragments.FuturesTradeDialog" }) as Dialog;
    this.markErrors({});
    this.tradeDialog.open();
    void this.refreshEquivalent(false, form.lots);
  }

  onCreate(): void {
    const lookup = (this.getView().getModel("lookup") as JSONModel).getData() as { accountsActive: { id: string; label: string }[] };
    const filterAccount = (this.filterModel().getProperty("/AccountId") as string) ?? "";
    const single = lookup.accountsActive.length === 1 ? lookup.accountsActive[0].id : "";
    void this.openTradeDialog({
      title: this.text("marketFuturesTradeTitleNew"), isNew: true, accounts: lookup.accountsActive,
      tradedAt: new Date(), accountId: lookup.accountsActive.some((a) => a.id === filterAccount) ? filterAccount : single,
      instrumentCode: "", side: "buy", lots: "", price: "", fees: "", feesCurrency: "brl", reason: "normal",
      brokerReference: "", purchaseContractKey: "", salesContractKey: "", purchaseContractCode: "", salesContractCode: "",
      notes: "", equivalent: "",
    }, null);
  }

  onEdit(): void {
    const trade = this.selectedTrade();
    if (!trade) {
      MessageBox.alert(this.text("commonSelectToEdit"));
      return;
    }
    const actions = tradeActions(trade, true);
    if (!actions.canEdit) {
      MessageBox.alert(this.text(actions.blockedKey));
      return;
    }
    const lookup = (this.getView().getModel("lookup") as JSONModel).getData() as { accountsAll: { id: string; label: string }[] };
    void this.openTradeDialog({
      title: this.text("marketFuturesTradeTitleEdit"), isNew: false, accounts: lookup.accountsAll,
      tradedAt: parseServerInstant(trade.TradedAt), accountId: String(trade.AccountId ?? ""), instrumentCode: trade.InstrumentCode,
      side: toCamel(trade.Side), lots: String(trade.Lots ?? ""), price: formatStrictDecimal(Number(trade.Price)),
      fees: Number(trade.Fees) ? formatStrictDecimal(Number(trade.Fees)) : "", feesCurrency: toCamel(trade.FeesCurrency) || "brl",
      reason: toCamel(trade.Reason) || "normal", brokerReference: trade.BrokerReference ?? "",
      purchaseContractKey: trade.PurchaseContractKey ?? "", salesContractKey: trade.SalesContractKey ?? "",
      purchaseContractCode: trade.PurchaseContractKey ? trade.ContractCode ?? "" : "",
      salesContractCode: trade.SalesContractKey ? trade.ContractCode ?? "" : "",
      notes: trade.Notes ?? "", equivalent: "",
    }, trade.Id);
  }

  /** Marca (ou limpa) o estado de erro de cada campo; `errors` traz a chave de i18n por campo. */
  private markErrors(errors: TradeFormErrors): void {
    for (const field of Object.keys(FIELD_CONTROL) as TradeField[]) {
      const control = this.byId(FIELD_CONTROL[field]) as unknown as Markable;
      if (!control) continue;
      control.setValueState(errors[field] ? "Error" : "None");
      if (errors[field]) control.setValueStateText(this.text(errors[field]));
    }
  }

  onInstrumentChange(): void {
    void this.refreshEquivalent(true, this.tradeModel().getProperty("/lots") as string);
  }

  /** `liveChange` não grava no modelo (sem valueLiveUpdate): o texto digitado vem do parâmetro `value` do evento. */
  onLotsLiveChange(ev: Input$LiveChangeEvent): void {
    void this.refreshEquivalent(false, ev.getParameter("value"));
  }

  onLotsChange(): void {
    void this.refreshEquivalent(false, this.tradeModel().getProperty("/lots") as string);
  }

  /** `lot-info` do instrumento, uma só requisição por instrumento (a promessa fica no cache); falha não é guardada. */
  private lotInfo(code: string): Promise<MarketLotInfo> {
    if (!this.lotInfoCache.has(code)) {
      const pending = marketFetch<MarketLotInfo>("GET", ServerRoutes.marketFuturesLotInfo(code)).then((result) => {
        if (result.ok && result.data) return result.data;
        this.lotInfoCache.delete(code);
        return null;
      });
      this.lotInfoCache.set(code, pending);
    }
    return this.lotInfoCache.get(code);
  }

  /**
   * Mostra o equivalente dos lotes digitados (toneladas, ou US$ no dólar futuro) pelo `lot-info` do servidor.
   * Sem lotes válidos mostra o equivalente de 1 lote. `adoptCurrency`: a troca de instrumento sugere a moeda das
   * taxas; isso vale para o instrumento escolhido mesmo que uma digitação posterior tenha superado o TEXTO.
   */
  private async refreshEquivalent(adoptCurrency: boolean, lotsText: string): Promise<void> {
    const seq = ++this.lotInfoSeq;
    const form = this.tradeModel().getData() as TradeDialogModel;
    const code = form.instrumentCode;
    if (!code) {
      this.tradeModel().setProperty("/equivalent", "");
      return;
    }
    const info = await this.lotInfo(code);
    if (info && adoptCurrency && form.isNew && info.currency
      && this.tradeModel().getProperty("/instrumentCode") === code) {
      this.tradeModel().setProperty("/feesCurrency", toCamel(info.currency));
    }
    if (seq !== this.lotInfoSeq) return;
    const hint = equivalentHint(info, lotsText);
    this.tradeModel().setProperty("/equivalent", hint ? this.text(hint.key, [hint.amount]) : "");
  }

  async onPickPurchaseContract(): Promise<void> {
    await pickPurchaseContract(this, this.tradeModel());
  }

  async onPickSalesContract(): Promise<void> {
    await pickSalesContract(this, this.tradeModel());
  }

  /** Limpar o campo (ícone de limpar) desfaz o vínculo; o campo só aceita escolha pelo value help. */
  onPurchaseContractChange(): void {
    syncContractLink(this.tradeModel());
  }

  onSalesContractChange(): void {
    syncContractLink(this.tradeModel());
  }

  onTradeCancel(): void {
    this.tradeDialog?.close();
  }

  async onTradeSave(): Promise<void> {
    const { payload, errors } = buildTradePayload(this.tradeModel().getData() as TradeForm);
    this.markErrors(errors);
    if (!payload) {
      MessageBox.warning(this.text(Object.values(errors)[0]));
      return;
    }
    this.setBusy(true);
    try {
      const result = this.editingId === null
        ? await marketFetch("POST", ServerRoutes.marketFuturesTrades, payload)
        : await marketFetch("PUT", ServerRoutes.marketFuturesTrade(this.editingId), payload);
      if (!result.ok) {
        this.showError(result);
        return;
      }
      this.tradeDialog?.close();
      MessageToast.show(this.text(this.editingId === null ? "commonSaved" : "commonUpdated"));
      this.binding()?.refresh();
    } finally {
      this.setBusy(false);
    }
  }
}
