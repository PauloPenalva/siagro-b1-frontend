import BaseController from "../BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Input from "sap/m/Input";
import Label from "sap/m/Label";
import Text from "sap/m/Text";
import VBox from "sap/m/VBox";
import Event from "sap/ui/base/Event";
import Control from "sap/ui/core/Control";
import Table from "sap/ui/table/Table";
import MultiSelectionPlugin, { MultiSelectionPlugin$SelectionChangeEvent } from "sap/ui/table/plugins/MultiSelectionPlugin";
import { RowActionItem$PressEvent } from "sap/ui/table/RowActionItem";
import ListBinding from "sap/ui/model/ListBinding";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { marketPositionLive } from "siagrob1/services/MarketLiveService";
import {
  connectionView, FLASH_DURATION_MS, flashedCells, formatInstantDateTime, marketFetch, MarketResult, notFoundTextKey
} from "siagrob1/helpers/MarketHelpers";
import { MARKET_MANAGE, numberErrorKey } from "siagrob1/helpers/MarketPricingHelpers";
import { formatIsoDate } from "siagrob1/helpers/MarketPriceGridHelpers";
import {
  buildCard, buildFxLockPayload, canDrillDown, commodityMtmText, contractDetailRoute, diffRows, drillDownQuery, flattenCommodityRows,
  flattenUsdRows, formatAmount, formatFxRate, formatSignedAmount, fxLockSide, limitStateTextKey, maturityLabel,
  POSITION_FLASH_FIELDS, sideTextKey, usdMtmText, withPositionFlashes
} from "siagrob1/helpers/MarketPositionHelpers";
import {
  MarketPositionContract, MarketPositionRow, MarketPositionSnapshot, MarketPositionUsdContract, PositionFlashField
} from "siagrob1/types/MarketPosition";

const ROUTE = "marketPosition";

type ContractRef = { side: string; contractKey: string };

/**
 * Painel de posição do Mercado: exposição por commodity e em dólar, travado, marcação a mercado e limites.
 *
 * Ciclo do SSE igual ao da grade de preços: handlers de rota presos UMA vez no onInit; o stream abre ao
 * entrar na rota (o 1º evento já traz o snapshot inteiro) e fecha ao sair e no onExit. Se o stream cair
 * antes do 1º evento, faz um GET simples (que também detecta o módulo desligado) e mostra "sem conexão"
 * com "Tentar de novo". Cada quadro atualiza o modelo no lugar para manter aba, seleção e rolagem.
 *
 * @namespace siagrob1.controller.marketPosition
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private bucketDialog?: Dialog;
  private usdDialog?: Dialog;
  private previousRows: MarketPositionRow[] = null;
  private flashTimer?: ReturnType<typeof setTimeout>;
  private flashSeq = 0;
  private selectionSyncSeq = 0;
  /** Descarta eventos e respostas de uma entrada anterior na rota. */
  private loadSeq = 0;
  private receivedSnapshot = false;

  onInit(): void {
    this.getView().setModel(new JSONModel({
      rows: [], usdRows: [], cards: [], alerts: [], resultRows: [], ignored: [], ignoredCount: 0,
      openValueText: "", spotText: "", generatedText: "", tab: "commodities",
      selectedRowKey: null, selectedCanDrill: false,
      statusText: "", statusState: "None", cmaText: "", cmaState: "None", offline: false,
      moduleDisabled: false, moduleMessage: "",
    }), "position");
    this.getView().setModel(new JSONModel({ rows: [], title: "", noData: "", busy: false }), "drill");
    this.getView().setModel(new JSONModel({ rows: [], canManage: false, noData: "", busy: false }), "usdc");

    this.getRouter().getRoute(ROUTE).attachPatternMatched(() => void this.enter());
    this.getRouter().attachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  onExit(): void {
    this.getRouter().detachBeforeRouteMatched(this.onBeforeRouteMatched, this);
    this.leave();
  }

  private readonly onBeforeRouteMatched = (ev: Router$BeforeRouteMatchedEvent): void => {
    if (ev.getParameter("name") !== ROUTE) this.leave();
  };

  private leave(): void {
    this.loadSeq++;
    this.cancelFlashTimer();
    marketPositionLive.stop();
    this.bucketDialog?.close();
    this.usdDialog?.close();
  }

  private model(): JSONModel {
    return this.getView().getModel("position") as JSONModel;
  }

  private text(key: string, args?: unknown[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  // ---- formatters da view ----

  maturityText = (year: number, month: number, isTotal: boolean): string =>
    (isTotal ? this.text("marketPositionTotal") : maturityLabel(year, month, this.text("marketPositionNoMaturity")));

  limitText = (state: string): string => this.text(limitStateTextKey(state));

  limitTooltip = (maxLong: number, maxShort: number): string =>
    (maxLong == null && maxShort == null ? "" : this.text("marketPositionLimitTooltip", [formatAmount(maxLong), formatAmount(maxShort)]));

  sideText = (side: string): string => (side ? this.text(sideTextKey(side)) : "");

  dateText = (iso: string): string => formatIsoDate(iso);

  // ---- ciclo de vida ----

  private async enter(): Promise<void> {
    this.bundle ??= await this.getResourceBundle();
    this.model().setProperty("/moduleDisabled", false);
    (this.getView().getModel("usdc") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    if (this.getRouter().getHashChanger().getHash() !== this.getRouter().getURL(ROUTE)) return;
    this.startStream();
  }

  private startStream(): void {
    const seq = ++this.loadSeq;
    this.receivedSnapshot = false;
    this.previousRows = null;
    this.setStatus(false);
    marketPositionLive.start<MarketPositionSnapshot>(ServerRoutes.marketPositionLive, {
      onData: (snapshot) => {
        if (seq !== this.loadSeq) return;
        this.receivedSnapshot = true;
        this.setStatus(false);
        this.applySnapshot(snapshot);
      },
      onConnectionChange: (disconnected) => {
        if (seq !== this.loadSeq) return;
        if (!disconnected) {
          this.setStatus(false);
          return;
        }
        this.previousRows = null;
        if (this.receivedSnapshot) {
          // Já há quadro na tela: o EventSource tenta reconectar sozinho; só avisa.
          this.setStatus(true);
          return;
        }
        // Falhou antes do 1º quadro: um GET simples para pintar (e detectar o módulo desligado).
        marketPositionLive.stop();
        void this.loadOnce(seq);
      },
    });
  }

  private async loadOnce(seq: number): Promise<void> {
    const result = await marketFetch<MarketPositionSnapshot>("GET", ServerRoutes.marketPosition);
    if (seq !== this.loadSeq) return;
    if (!result.ok && result.status === 404 && result.moduleDisabled) {
      this.model().setProperty("/moduleMessage", this.text(notFoundTextKey(true)));
      this.model().setProperty("/moduleDisabled", true);
      return;
    }
    this.setStatus(true);
    if (result.ok) this.applySnapshot(result.data);
    else this.showError(result);
  }

  onRetry(): void {
    this.startStream();
  }

  private setStatus(offline: boolean): void {
    const model = this.model();
    model.setProperty("/offline", offline);
    model.setProperty("/statusText", this.text(offline ? "marketStatusNoServer" : "marketPositionLive"));
    model.setProperty("/statusState", offline ? "Error" : "Success");
  }

  // ---- aplicação do snapshot ----

  private applySnapshot(snapshot: MarketPositionSnapshot): void {
    if (!snapshot) return;
    const model = this.model();
    const text = (key: string, args?: unknown[]): string => this.text(key, args);

    if (snapshot.connectionStatus) {
      const view = connectionView(snapshot.connectionStatus, false);
      model.setProperty("/cmaText", this.text(view.textKey, [snapshot.connectionMessage ?? ""]));
      model.setProperty("/cmaState", view.state);
    } else {
      model.setProperty("/cmaText", "");
    }
    model.setProperty("/generatedText", snapshot.generatedAt ? this.text("marketPositionGeneratedAt", [formatInstantDateTime(snapshot.generatedAt)]) : "");

    // Grade de commodities: no lugar quando as linhas são as mesmas.
    const rows = withPositionFlashes(this.previousRows, flattenCommodityRows(snapshot.commodities), ++this.flashSeq, Date.now());
    this.updateRows("/rows", rows);
    this.previousRows = rows;
    this.updateRows("/usdRows", flattenUsdRows(snapshot.usd));
    this.refreshSelectedState();
    this.syncTableSelection();
    this.scheduleFlashExpiry();

    const cards = (snapshot.commodities ?? []).map((c) => buildCard({
      title: c.name || c.code, net: c.total?.netTons, covered: c.total?.coveredTons, hedgePercent: c.total?.hedgePercent,
      limitState: c.total?.limitState, unit: "tons", mtmText: commodityMtmText(c.total, text),
    }, text));
    const usdTotal = snapshot.usd?.total;
    if (usdTotal) {
      cards.push(buildCard({
        title: this.text("marketPositionCardUsd"), net: usdTotal.netUsd, covered: usdTotal.coveredUsd, hedgePercent: usdTotal.hedgePercent,
        limitState: usdTotal.limitState, unit: "usd", mtmText: usdMtmText(usdTotal, text),
      }, text));
    }
    this.setIfChanged("/cards", cards);
    this.setIfChanged("/alerts", (snapshot.alerts ?? []).map((a) => ({
      text: this.text("marketPositionAlert", [a.description ?? "", formatSignedAmount(a.value), formatAmount(a.limitValue)]),
    })));
    this.setIfChanged("/resultRows", [
      { label: this.text("marketPositionRealized"), usd: snapshot.results?.realizedUsd, brl: snapshot.results?.realizedBrl },
      { label: this.text("marketPositionUnrealized"), usd: snapshot.results?.unrealizedUsd, brl: snapshot.results?.unrealizedBrl },
    ]);
    this.setIfChanged("/ignored", snapshot.ignored ?? []);
    model.setProperty("/ignoredCount", (snapshot.ignored ?? []).length);
    model.setProperty("/openValueText", this.text("marketPositionOpenValue", [formatAmount(snapshot.usd?.openCommodityValueUsd)]));
    model.setProperty("/spotText", this.text("marketPositionSpot", [formatFxRate(snapshot.usd?.spotFx)]));
  }

  /** Troca o array só se a estrutura mudou; senão grava só os campos alterados (seleção e rolagem ficam). */
  private updateRows<T extends { rowKey: string }>(path: string, next: T[]): void {
    const model = this.model();
    const changes = diffRows(model.getProperty(path) as T[], next);
    if (changes === null) {
      model.setProperty(path, next);
      return;
    }
    for (const { index, field, value } of changes) model.setProperty(`${path}/${index}/${field}`, value);
  }

  private setIfChanged(path: string, value: unknown): void {
    if (JSON.stringify(this.model().getProperty(path)) !== JSON.stringify(value)) this.model().setProperty(path, value);
  }

  private cancelFlashTimer(): void {
    clearTimeout(this.flashTimer);
    this.flashTimer = undefined;
  }

  private scheduleFlashExpiry(): void {
    this.cancelFlashTimer();
    this.flashTimer = setTimeout(() => {
      this.flashTimer = undefined;
      const model = this.model();
      for (const { index, field } of flashedCells(model.getProperty("/rows") as Parameters<typeof flashedCells<MarketPositionRow, PositionFlashField>>[0], POSITION_FLASH_FIELDS)) {
        model.setProperty(`/rows/${index}/flash/${field}`, "");
        model.setProperty(`/rows/${index}/flashAt/${field}`, 0);
      }
    }, FLASH_DURATION_MS);
  }

  // ---- seleção (pela chave da linha, nunca pelo índice) ----

  private table(): Table {
    return this.byId("positionTable") as Table;
  }

  private selection(): MultiSelectionPlugin {
    return this.byId("positionSelection") as MultiSelectionPlugin;
  }

  onSelectionChange(ev: MultiSelectionPlugin$SelectionChangeEvent): void {
    if ((ev.getParameter("customPayload") as { sync?: boolean })?.sync) return;
    const index = this.selection().getSelectedIndices()[0] ?? -1;
    const key = index < 0 ? null : this.table().getContextByIndex(index)?.getProperty("rowKey") as string;
    this.model().setProperty("/selectedRowKey", key ?? null);
    this.refreshSelectedState();
  }

  private selectedRow(): MarketPositionRow {
    const key = this.model().getProperty("/selectedRowKey") as string;
    return key == null ? undefined : (this.model().getProperty("/rows") as MarketPositionRow[]).find((r) => r.rowKey === key);
  }

  private refreshSelectedState(): void {
    this.model().setProperty("/selectedCanDrill", canDrillDown(this.selectedRow()));
  }

  private syncTableSelection(): void {
    const binding = this.table()?.getBinding("rows") as ListBinding;
    const selection = this.selection();
    if (!binding || !selection) return;
    const key = this.model().getProperty("/selectedRowKey") as string;
    const contexts = key != null ? binding.getContexts(0, binding.getLength()) : [];
    const index = contexts.findIndex((c) => c?.getProperty("rowKey") === key);
    const current = selection.getSelectedIndices()[0] ?? -1;
    const seq = ++this.selectionSyncSeq;
    if (index < 0) {
      if (current >= 0) selection.clearSelection({ sync: true });
      if (key != null) {
        this.model().setProperty("/selectedRowKey", null);
        this.refreshSelectedState();
      }
    } else if (current !== index) {
      selection.setSelectedIndex(index, { sync: true })
        .then(() => { if (seq === this.selectionSyncSeq) this.refreshSelectedState(); })
        .catch(() => { /* contexto indisponível: a próxima atualização tenta de novo */ });
    }
  }

  // ---- contratos do balde ----

  onShowBucketContracts(): void {
    const row = this.selectedRow();
    if (canDrillDown(row)) void this.openBucketContracts(row);
  }

  onRowContracts(ev: RowActionItem$PressEvent): void {
    const row = ev.getParameter("row")?.getBindingContext("position")?.getObject() as MarketPositionRow;
    if (canDrillDown(row)) void this.openBucketContracts(row);
  }

  private async openBucketContracts(row: MarketPositionRow): Promise<void> {
    const drill = this.getView().getModel("drill") as JSONModel;
    const title = row.isTotal ? this.text("marketPositionContractsTitleTotal", [row.commodityName || row.commodityCode])
      : this.text("marketPositionContractsTitle", [row.commodityName || row.commodityCode, maturityLabel(row.year, row.month, "")]);
    drill.setData({ rows: [], title, noData: this.text("marketPositionContractsNoData"), busy: true });
    this.bucketDialog ??= await this.loadFragment({ name: "siagrob1.view.marketPosition.fragments.BucketContractsDialog" }) as Dialog;
    this.bucketDialog.open();
    const query = drillDownQuery(row);
    const result = await marketFetch<MarketPositionContract[]>("GET", ServerRoutes.marketPositionContracts(query.commodity, query.year, query.month));
    drill.setProperty("/busy", false);
    if (!result.ok) {
      this.showError(result);
      return;
    }
    drill.setProperty("/rows", result.data ?? []);
  }

  onCloseBucketContracts(): void {
    this.bucketDialog?.close();
  }

  // ---- contratos atrelados a dólar + fechar/reabrir câmbio ----

  private usdModel(): JSONModel {
    return this.getView().getModel("usdc") as JSONModel;
  }

  async onShowUsdContracts(): Promise<void> {
    this.usdModel().setProperty("/noData", this.text("marketPositionContractsNoData"));
    this.usdDialog ??= await this.loadFragment({ name: "siagrob1.view.marketPosition.fragments.UsdContractsDialog" }) as Dialog;
    this.usdDialog.open();
    await this.loadUsdContracts();
  }

  private async loadUsdContracts(): Promise<void> {
    const model = this.usdModel();
    model.setProperty("/busy", true);
    const result = await marketFetch<MarketPositionUsdContract[]>("GET", ServerRoutes.marketPositionUsdContracts);
    model.setProperty("/busy", false);
    if (!result.ok) {
      this.showError(result);
      return;
    }
    model.setProperty("/rows", result.data ?? []);
  }

  onCloseUsdContracts(): void {
    this.usdDialog?.close();
  }

  async onFxLock(ev: Event): Promise<void> {
    const contract = this.usdContractOf(ev);
    if (!contract) return;
    const rateText = await this.askFxRate(contract);
    if (rateText === null) return;
    const { payload, error } = buildFxLockPayload(true, rateText);
    if (!payload) {
      MessageBox.warning(this.text(numberErrorKey(error)));
      return;
    }
    await this.sendFxLock(contract, payload);
  }

  async onFxUnlock(ev: Event): Promise<void> {
    const contract = this.usdContractOf(ev);
    if (!contract) return;
    await this.sendFxLock(contract, buildFxLockPayload(false, "").payload);
  }

  private usdContractOf(ev: Event): MarketPositionUsdContract {
    return ev.getSource<Control>().getBindingContext("usdc")?.getObject() as MarketPositionUsdContract;
  }

  /** Pergunta a taxa (opcional). Resolve com o texto digitado ou `null` se desistiu. */
  private askFxRate(contract: MarketPositionUsdContract): Promise<string> {
    return new Promise((resolve) => {
      let answer: string = null;
      const input = new Input({ width: "100%", placeholder: this.text("marketPositionFxRatePlaceholder") });
      const label = new Label({ text: this.text("marketPositionColFxRate"), labelFor: input });
      const dialog = new Dialog({
        title: this.text("marketPositionFxLockTitle", [contract.contractCode]),
        contentWidth: "24rem",
        content: [new VBox({ items: [new Text({ text: this.text("marketPositionFxLockHint") }), label, input] }).addStyleClass("sapUiSmallMargin")],
        beginButton: new Button({ text: this.text("marketPositionFxLock"), type: "Emphasized", press: () => { answer = input.getValue(); dialog.close(); } }),
        endButton: new Button({ text: this.text("marketPositionCancel"), press: () => dialog.close() }),
        afterClose: () => { dialog.destroy(); resolve(answer); },
      });
      this.getView().addDependent(dialog);
      dialog.open();
    });
  }

  private async sendFxLock(contract: MarketPositionUsdContract, payload: { locked: boolean; fxRate: number }): Promise<void> {
    this.usdDialog?.setBusy(true);
    let result: MarketResult;
    try {
      result = await marketFetch("POST", ServerRoutes.marketContractFxLock(fxLockSide(contract.side), contract.contractKey), payload);
    } finally {
      this.usdDialog?.setBusy(false);
    }
    if (!result.ok) {
      this.showError(result);
      return;
    }
    MessageToast.show(this.text(payload.locked ? "marketPositionFxLocked" : "marketPositionFxReopened"));
    await this.loadUsdContracts();
    await this.refreshSnapshot();
  }

  /** Recarrega o snapshot já (o SSE só emite quando as cotações mudam). */
  private async refreshSnapshot(): Promise<void> {
    const seq = this.loadSeq;
    const result = await marketFetch<MarketPositionSnapshot>("GET", ServerRoutes.marketPosition);
    if (seq === this.loadSeq && result.ok) this.applySnapshot(result.data);
  }

  // ---- abrir contrato ----

  onOpenContract(ev: Event): void {
    const source = ev.getSource<Control>();
    const ref = (source.getBindingContext("drill") ?? source.getBindingContext("usdc") ?? source.getBindingContext("position"))
      ?.getObject() as ContractRef;
    if (!ref?.contractKey) return;
    this.navTo(contractDetailRoute(ref.side), { id: ref.contractKey });
  }

  private showError(result: MarketResult): void {
    if (result.status === 404) {
      MessageBox.warning(this.text(notFoundTextKey(result.moduleDisabled)));
      return;
    }
    MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }
}
