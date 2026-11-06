import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import { Input$LiveChangeEvent } from "sap/m/Input";
import Sorter from "sap/ui/model/Sorter";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import BaseController from "../BaseController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { pickPurchaseContract, pickSalesContract, syncContractLink } from "siagrob1/helpers/MarketContractLink";
import { EMPTY_VALUE, MarketResult, marketFetch, notFoundTextKey, parseServerInstant } from "siagrob1/helpers/MarketHelpers";
import { accountOptions, formatPnl, pnlState, sideTextKey, toCamel } from "siagrob1/helpers/MarketHedgeHelpers";
import {
  FxHedgeField, FxHedgeForm, FxHedgeFormErrors, FxHedgesFilter, buildFxHedgePayload, buildFxHedgesFilter, defaultFxFilter,
  formatDayMonth, formatRate, formatUsd, fxHedgeActions, fxKindTextKey, fxSettlementResult, fxStatusTextKey, fxTotals,
  parseSettlementRate, suggestedRateSourceKey
} from "siagrob1/helpers/MarketFxHedgeHelpers";
import { loadCounterparties } from "siagrob1/helpers/MarketLookups";
import { formatStrictDecimal, MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { MarketFxHedge, MarketSuggestedRate } from "siagrob1/types/MarketHedges";

/** Id do controle do diálogo que carrega o estado de erro de cada campo. */
const FIELD_CONTROL: Record<FxHedgeField, string> = {
  tradedAt: "fxTradedAt", accountId: "fxAccount", kind: "fxKind", side: "fxSide", amountUsd: "fxAmount",
  contractedRate: "fxRate", settlementDate: "fxSettlementDate",
};

type Markable = { setValueState(state: "None" | "Error"): unknown; setValueStateText(text: string): unknown };

/** Estado do diálogo do hedge: `FxHedgeForm` + o que a tela mostra. */
type HedgeDialogModel = FxHedgeForm & {
  title: string;
  accounts: { id: string; label: string }[];
  /** Código do contrato vinculado (só exibição), um por tipo. */
  purchaseContractCode: string;
  salesContractCode: string;
};

/** Estado do diálogo de liquidação. */
type SettleModel = {
  id: number;
  summary: string;
  side: string;
  contractedRate: number;
  amountUsd: number;
  rate: string;
  rateState: "None" | "Error";
  rateStateText: string;
  sourceText: string;
  resultText: string;
  resultState: "Success" | "Error" | "None";
};

/**
 * Hedge de moeda (NDF/termo): lista OData `MarketFxHedges` (só leitura; gravação por REST), liquidação com a
 * taxa sugerida e resultado em R$ calculado ao vivo. O sistema só REGISTRA: nada aqui fala com o banco.
 *
 * @namespace siagrob1.controller.marketFxHedges
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private hedgeDialog?: Dialog;
  private settleDialog?: Dialog;
  /** Id do hedge em alteração; nulo = inclusão. */
  private editingId: number = null;
  private visited = false;
  /** Trava de ação em andamento: evita abrir duas confirmações ou gravar duas vezes com cliques seguidos. */
  private acting = false;
  private totalsSeq = 0;
  private suggestSeq = 0;

  /** Textos de enum (campos de instância, não getters: o UI5 resolve `.sideText` por nome). */
  sideText = (side: string): string => (side ? this.text(sideTextKey(side)) : "");
  kindText = (kind: string): string => (kind ? this.text(fxKindTextKey(kind)) : "");
  statusText = (status: string): string => (status ? this.text(fxStatusTextKey(status)) : "");

  onInit(): void {
    this.getView().setModel(new JSONModel({ canManage: false }), "view");
    this.getView().setModel(new JSONModel(defaultFxFilter()), "filter");
    this.getView().setModel(new JSONModel({ accountsAll: [], accountsActive: [] }), "lookup");
    this.getView().setModel(new JSONModel(this.noSelection()), "sel");
    this.getView().setModel(new JSONModel({ bought: "", sold: "", realized: "", realizedState: "None" }), "totals");
    this.getView().setModel(new JSONModel({}), "hedge");
    this.getView().setModel(new JSONModel({}), "settle");
    this.getRouter().getRoute("marketFxHedges").attachPatternMatched(() => void this.routeMatched());
  }

  private noSelection() {
    return { ...fxHedgeActions(undefined, false), has: false, editTooltip: "" };
  }

  private async routeMatched(): Promise<void> {
    this.viewModel().setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    const model = this.getView().getModel() as ODataModel;
    const counterparties = await loadCounterparties(model);
    const lookup = this.getView().getModel("lookup") as JSONModel;
    lookup.setProperty("/accountsAll", accountOptions(counterparties, "Bank", false));
    lookup.setProperty("/accountsActive", accountOptions(counterparties, "Bank", true));

    const revisit = this.visited;
    this.visited = true;
    if (revisit) this.binding()?.refresh();
    else this.bindHedges();
    void this.refreshTotals();
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

  private hedgeModel(): JSONModel {
    return this.getView().getModel("hedge") as JSONModel;
  }

  private settleModel(): JSONModel {
    return this.getView().getModel("settle") as JSONModel;
  }

  private table(): Table {
    return this.byId("tableFxHedges") as Table;
  }

  private binding(): ODataListBinding {
    return this.table().getBinding("rows") as ODataListBinding;
  }

  private currentFilter(): string {
    return buildFxHedgesFilter(this.filterModel().getData() as FxHedgesFilter, new Date());
  }

  /** As linhas só são ligadas com o bundle resolvido: `sideText`/`kindText`/`statusText` leem `this.bundle`. */
  private bindHedges(): void {
    this.table().bindRows({
      path: "/MarketFxHedges",
      parameters: {
        $select: "Id,TradedAt,TradeDate,AccountId,Kind,Side,AmountUsd,ContractedRate,SettlementDate,Status,SettlementRate,"
          + "SettledAt,RealizedPnlBrl,BankReference,Confirmed,PurchaseContractKey,SalesContractKey,ContractCode,Notes",
        $expand: "Account($select=Code;$expand=Counterparty($select=Name))",
        $filter: this.currentFilter(),
      },
      sorter: [new Sorter("SettlementDate", false), new Sorter("Id", true)],
    });
  }

  /** Totais do rodapé sobre TODAS as linhas do filtro (a grade é paginada): consulta própria só com o necessário. */
  private async refreshTotals(): Promise<void> {
    const seq = ++this.totalsSeq;
    const model = this.getView().getModel() as ODataModel;
    const parameters: Record<string, string> = { $select: "Status,Side,AmountUsd,RealizedPnlBrl" };
    const filter = this.currentFilter();
    if (filter) parameters.$filter = filter;
    const binding = model.bindList("/MarketFxHedges", undefined, undefined, undefined, parameters);
    const totals = this.getView().getModel("totals") as JSONModel;
    try {
      const contexts = await binding.requestContexts(0, 5000);
      if (seq !== this.totalsSeq) return;
      const sums = fxTotals(contexts.map((context) => context.getObject() as MarketFxHedge));
      totals.setData({
        bought: this.text("marketFxTotalBought", [formatUsd(sums.openBoughtUsd)]),
        sold: this.text("marketFxTotalSold", [formatUsd(sums.openSoldUsd)]),
        realized: this.text("marketFxTotalRealized", [formatPnl(sums.realizedBrl, "brl")]),
        realizedState: pnlState(sums.realizedBrl),
      });
    } catch {
      if (seq === this.totalsSeq) totals.setData({ bought: "", sold: "", realized: this.text("marketFxTotalsUnavailable"), realizedState: "None" });
    } finally {
      binding.destroy();
    }
  }

  private refreshAll(): void {
    this.binding()?.refresh();
    void this.refreshTotals();
  }

  private showError(result: MarketResult): void {
    if (result.status === 404) {
      MessageBox.warning(this.text(notFoundTextKey(result.moduleDisabled === true)));
      return;
    }
    // 400/403 chegam em texto pt-BR do servidor: mostrados como recebidos.
    MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }

  /** Roda uma ação por vez: um segundo clique durante a confirmação ou a gravação é ignorado. */
  private async exclusive(action: () => Promise<void>): Promise<void> {
    if (this.acting) return;
    this.acting = true;
    try {
      await action();
    } finally {
      this.acting = false;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Filtro e seleção
  // -------------------------------------------------------------------------------------------

  onSearch(): void {
    this.binding()?.changeParameters({ $filter: this.currentFilter() });
    void this.refreshTotals();
  }

  onClearFilters(): void {
    this.filterModel().setData(defaultFxFilter());
    this.onSearch();
  }

  onRefresh(): void {
    this.refreshAll();
  }

  private selectedContext(): Context {
    return this.getSelectRowContext(this.table());
  }

  private selectedHedge(): MarketFxHedge {
    return this.selectedContext()?.getObject() as MarketFxHedge;
  }

  /** Recalcula quais botões a linha selecionada aceita (chamado na seleção e a cada atualização das linhas). */
  onSelectionChange(): void {
    const hedge = this.selectedHedge();
    const actions = fxHedgeActions(hedge, this.viewModel().getProperty("/canManage") as boolean);
    const next = { ...actions, has: !!hedge, editTooltip: actions.blockedKey ? this.text(actions.blockedKey) : "" };
    const sel = this.getView().getModel("sel") as JSONModel;
    if (JSON.stringify(sel.getData()) !== JSON.stringify(next)) sel.setData(next);
  }

  // -------------------------------------------------------------------------------------------
  // Ações simples (confirmar, reabrir, cancelar, excluir)
  // -------------------------------------------------------------------------------------------

  async onConfirm(): Promise<void> {
    await this.postOnSelected((id) => ServerRoutes.marketFxHedgeConfirm(id), "marketFuturesConfirmed");
  }

  async onUnconfirm(): Promise<void> {
    await this.postOnSelected((id) => ServerRoutes.marketFxHedgeUnconfirm(id), "marketFuturesUnconfirmed");
  }

  async onReopen(): Promise<void> {
    await this.postOnSelected((id) => ServerRoutes.marketFxHedgeReopen(id), "marketFxReopened", "marketFxReopenConfirm");
  }

  async onCancelHedge(): Promise<void> {
    await this.postOnSelected((id) => ServerRoutes.marketFxHedgeCancel(id), "marketFxCanceled", "marketFxCancelConfirm");
  }

  /** POST numa ação do hedge selecionado; `confirmKey` pede confirmação antes (a trava cobre o diálogo aberto). */
  private async postOnSelected(url: (id: number) => string, successKey: string, confirmKey?: string): Promise<void> {
    await this.exclusive(async () => {
      const hedge = this.selectedHedge();
      if (!hedge) {
        MessageBox.alert(this.text("marketFxSelectHedge"));
        return;
      }
      if (confirmKey && !(await confirmDialog(this.text(confirmKey, [String(hedge.Id)]), this.text("marketFxTitle")))) return;
      this.setBusy(true);
      try {
        const result = await marketFetch("POST", url(hedge.Id));
        if (!result.ok) {
          this.showError(result);
          return;
        }
        MessageToast.show(this.text(successKey));
        this.refreshAll();
      } finally {
        this.setBusy(false);
      }
    });
  }

  async onDelete(): Promise<void> {
    await this.exclusive(async () => {
      const hedge = this.selectedHedge();
      if (!hedge) {
        MessageBox.alert(this.text("commonSelectToDelete"));
        return;
      }
      const actions = fxHedgeActions(hedge, true);
      if (!actions.canDelete) {
        MessageBox.alert(this.text(actions.blockedKey));
        return;
      }
      if (!(await confirmDialog(this.text("commonDeleteConfirm"), this.text("commonDelete")))) return;

      this.setBusy(true);
      try {
        const result = await marketFetch("DELETE", ServerRoutes.marketFxHedge(hedge.Id));
        if (!result.ok) {
          this.showError(result);
          return;
        }
        MessageToast.show(this.text("commonDeleted"));
        this.refreshAll();
      } finally {
        this.setBusy(false);
      }
    });
  }

  // -------------------------------------------------------------------------------------------
  // Liquidação
  // -------------------------------------------------------------------------------------------

  async onSettle(): Promise<void> {
    await this.exclusive(async () => {
      const hedge = this.selectedHedge();
      if (!hedge) {
        MessageBox.alert(this.text("marketFxSelectHedge"));
        return;
      }
      if (!fxHedgeActions(hedge, true).canSettle) {
        MessageBox.alert(this.text("marketFxBlockedNotOpen"));
        return;
      }
      const seq = ++this.suggestSeq;
      this.settleModel().setData({
        id: hedge.Id,
        summary: this.text("marketFxSettleSummary", [
          String(hedge.Id), this.text(sideTextKey(hedge.Side)), formatUsd(hedge.AmountUsd), formatRate(hedge.ContractedRate),
        ]),
        side: toCamel(hedge.Side),
        contractedRate: Number(hedge.ContractedRate),
        amountUsd: Number(hedge.AmountUsd),
        rate: "", rateState: "None", rateStateText: "", sourceText: this.text("marketFxSuggestedLoading"),
        resultText: EMPTY_VALUE, resultState: "None",
      } as SettleModel);
      this.settleDialog ??= await this.loadFragment({ name: "siagrob1.view.marketFxHedges.fragments.SettleDialog" }) as Dialog;
      this.settleDialog.open();

      void this.loadSuggestedRate(hedge.Id, seq);
    });
  }

  /** A taxa sugerida chega depois: não sobrescreve o que o usuário já digitou nem uma abertura mais nova. */
  private async loadSuggestedRate(id: number, seq: number): Promise<void> {
    const result = await marketFetch<MarketSuggestedRate>("GET", ServerRoutes.marketFxHedgeSuggestedRate(id));
    if (seq !== this.suggestSeq) return;
    if (!result.ok) {
      this.settleModel().setProperty("/sourceText", this.text("marketFxSuggestedNone"));
      this.showError(result);
      return;
    }
    const suggestion = result.data;
    const rate = suggestion?.rate;
    if (rate === null || rate === undefined) {
      this.settleModel().setProperty("/sourceText", this.text("marketFxSuggestedNone"));
      return;
    }
    const sourceText = this.text(suggestedRateSourceKey(suggestion.source), [formatDayMonth(suggestion.date)]);
    this.settleModel().setProperty("/sourceText", sourceText);
    if (!(this.settleModel().getProperty("/rate") as string)) {
      this.settleModel().setProperty("/rate", formatStrictDecimal(rate));
      this.updateSettleResult();
    }
  }

  onSettleRateLiveChange(ev: Input$LiveChangeEvent): void {
    // O binding só grava no change: durante a digitação o valor vem do evento.
    this.settleModel().setProperty("/rate", ev.getParameter("value"));
    this.updateSettleResult();
  }

  /** Recalcula o resultado em R$ e o estado do campo a cada taxa digitada. */
  private updateSettleResult(): void {
    const model = this.settleModel();
    const data = model.getData() as SettleModel;
    const parsed = parseSettlementRate(data.rate);
    if (parsed.errorKey) {
      model.setProperty("/rateState", "Error");
      model.setProperty("/rateStateText", this.text(parsed.errorKey));
    } else {
      model.setProperty("/rateState", "None");
      model.setProperty("/rateStateText", "");
    }
    const result = parsed.value === null ? null : fxSettlementResult(data.side, data.contractedRate, parsed.value, data.amountUsd);
    model.setProperty("/resultText", result === null ? EMPTY_VALUE : formatPnl(result, "brl"));
    model.setProperty("/resultState", result === null ? "None" : pnlState(result));
  }

  onSettleCancel(): void {
    this.suggestSeq++;
    this.settleDialog?.close();
  }

  async onSettleConfirm(): Promise<void> {
    await this.exclusive(async () => {
      const data = this.settleModel().getData() as SettleModel;
      const parsed = parseSettlementRate(data.rate);
      if (parsed.value === null) {
        this.settleModel().setProperty("/rateState", "Error");
        this.settleModel().setProperty("/rateStateText", this.text(parsed.errorKey ?? "marketFxRateRequired"));
        return;
      }
      this.setBusy(true);
      try {
        const result = await marketFetch("POST", ServerRoutes.marketFxHedgeSettle(data.id), { rate: parsed.value });
        if (!result.ok) {
          this.showError(result);
          return;
        }
        this.suggestSeq++;
        this.settleDialog?.close();
        MessageToast.show(this.text("marketFxSettled"));
        this.refreshAll();
      } finally {
        this.setBusy(false);
      }
    });
  }

  // -------------------------------------------------------------------------------------------
  // Diálogo do hedge
  // -------------------------------------------------------------------------------------------

  private async openHedgeDialog(form: HedgeDialogModel, id: number): Promise<void> {
    this.editingId = id;
    this.hedgeModel().setData(form);
    this.hedgeDialog ??= await this.loadFragment({ name: "siagrob1.view.marketFxHedges.fragments.FxHedgeDialog" }) as Dialog;
    this.markErrors({});
    this.hedgeDialog.open();
  }

  onCreate(): void {
    const lookup = (this.getView().getModel("lookup") as JSONModel).getData() as { accountsActive: { id: string; label: string }[] };
    const filterAccount = (this.filterModel().getProperty("/AccountId") as string) ?? "";
    const single = lookup.accountsActive.length === 1 ? lookup.accountsActive[0].id : "";
    void this.openHedgeDialog({
      title: this.text("marketFxHedgeTitleNew"), accounts: lookup.accountsActive,
      tradedAt: new Date(), accountId: lookup.accountsActive.some((a) => a.id === filterAccount) ? filterAccount : single,
      kind: "ndf", side: "sell", amountUsd: "", contractedRate: "", settlementDate: localIsoDate(new Date()),
      bankReference: "", purchaseContractKey: "", salesContractKey: "", purchaseContractCode: "", salesContractCode: "", notes: "",
    }, null);
  }

  onEdit(): void {
    const hedge = this.selectedHedge();
    if (!hedge) {
      MessageBox.alert(this.text("commonSelectToEdit"));
      return;
    }
    const actions = fxHedgeActions(hedge, true);
    if (!actions.canEdit) {
      MessageBox.alert(this.text(actions.blockedKey));
      return;
    }
    const lookup = (this.getView().getModel("lookup") as JSONModel).getData() as { accountsAll: { id: string; label: string }[] };
    void this.openHedgeDialog({
      title: this.text("marketFxHedgeTitleEdit"), accounts: lookup.accountsAll,
      tradedAt: parseServerInstant(hedge.TradedAt), accountId: String(hedge.AccountId ?? ""),
      kind: toCamel(hedge.Kind) || "ndf", side: toCamel(hedge.Side) || "sell",
      amountUsd: formatStrictDecimal(Number(hedge.AmountUsd)), contractedRate: formatStrictDecimal(Number(hedge.ContractedRate)),
      settlementDate: (hedge.SettlementDate ?? "").slice(0, 10), bankReference: hedge.BankReference ?? "",
      purchaseContractKey: hedge.PurchaseContractKey ?? "", salesContractKey: hedge.SalesContractKey ?? "",
      purchaseContractCode: hedge.PurchaseContractKey ? hedge.ContractCode ?? "" : "",
      salesContractCode: hedge.SalesContractKey ? hedge.ContractCode ?? "" : "",
      notes: hedge.Notes ?? "",
    }, hedge.Id);
  }

  /** Marca (ou limpa) o estado de erro de cada campo; `errors` traz a chave de i18n por campo. */
  private markErrors(errors: FxHedgeFormErrors): void {
    for (const field of Object.keys(FIELD_CONTROL) as FxHedgeField[]) {
      const control = this.byId(FIELD_CONTROL[field]) as unknown as Markable;
      if (!control) continue;
      control.setValueState(errors[field] ? "Error" : "None");
      if (errors[field]) control.setValueStateText(this.text(errors[field]));
    }
  }

  async onPickPurchaseContract(): Promise<void> {
    await pickPurchaseContract(this, this.hedgeModel());
  }

  async onPickSalesContract(): Promise<void> {
    await pickSalesContract(this, this.hedgeModel());
  }

  onContractChange(): void {
    syncContractLink(this.hedgeModel());
  }

  onHedgeCancel(): void {
    this.hedgeDialog?.close();
  }

  async onHedgeSave(): Promise<void> {
    await this.exclusive(async () => {
      const { payload, errors } = buildFxHedgePayload(this.hedgeModel().getData() as FxHedgeForm);
      this.markErrors(errors);
      if (!payload) {
        MessageBox.warning(this.text(Object.values(errors)[0]));
        return;
      }
      this.setBusy(true);
      try {
        const result = this.editingId === null
          ? await marketFetch("POST", ServerRoutes.marketFxHedges, payload)
          : await marketFetch("PUT", ServerRoutes.marketFxHedge(this.editingId), payload);
        if (!result.ok) {
          this.showError(result);
          return;
        }
        this.hedgeDialog?.close();
        MessageToast.show(this.text(this.editingId === null ? "commonSaved" : "commonUpdated"));
        this.refreshAll();
      } finally {
        this.setBusy(false);
      }
    });
  }
}
