import BaseController from "../BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import Table from "sap/ui/table/Table";
import MultiSelectionPlugin, { MultiSelectionPlugin$SelectionChangeEvent } from "sap/ui/table/plugins/MultiSelectionPlugin";
import ListBinding from "sap/ui/model/ListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { marketPriceGridLive } from "siagrob1/services/MarketLiveService";
import { FLASH_DURATION_MS, formatQuoteValue, marketFetch, MarketResult, notFoundTextKey } from "siagrob1/helpers/MarketHelpers";
import { municipalityLabel, parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import {
  buildTicketPayload, canBuy, clearPriceGridFlashes, loadPriceGridPreference, priceDeviationPercent, priceStatusTextKey,
  formatStepValue, sacksToTons, savePriceGridPreference, stepUnitKey, ticketErrorKey, withPriceGridFlashes
} from "siagrob1/helpers/MarketPriceGridHelpers";
import {
  MarketFreightCity, MarketPriceGrid, MarketPriceGridRow, MarketPriceGridViewRow, MarketTicketForm, MarketTradeTicketCreated
} from "siagrob1/types/MarketPriceGrid";

const ROUTE = "marketPriceGrid";
/** Rota do detalhe da boleta (criada pela tela de boletas; até lá a tela fica na grade). */
const TICKET_DETAIL_ROUTE = "marketTradeTicketsDetail";

const TICKET_INPUTS: Partial<Record<keyof MarketTicketForm, string>> = {
  cardCode: "ticketPartner", sacks: "ticketSacks", negotiatedPrice: "ticketPrice", warehouseCode: "ticketWarehouse",
  agentCode: "ticketAgent", branchCode: "ticketBranch", logisticRegionCode: "ticketLogisticRegion",
};

/**
 * Grade "Ordem de Compra": preço por cidade (R$/saca 60 kg) de cada linha das tabelas de preço da safra,
 * ao vivo pelo SSE, e emissão da boleta ("Comprar").
 *
 * Ciclo do SSE igual ao terminal: handlers de rota presos UMA vez no onInit (a view é reaproveitada);
 * o stream só abre com safra e cidade escolhidas, é trocado quando uma delas muda e fecha ao sair da
 * rota (beforeRouteMatched) e no onExit. Usa a instância própria do serviço (`marketPriceGridLive`).
 *
 * @namespace siagrob1.controller.marketPriceGrid
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private breakdownDialog?: Dialog;
  private ticketDialog?: Dialog;
  private browserDisconnected = false;
  /** Quadro anterior; null = próximo quadro é linha de base (nada pisca). */
  private previousRows: MarketPriceGridViewRow[] = null;
  /** Timer único que apaga as piscadas vencidas (os quadros da grade são raros: o atributo ficaria no DOM). */
  private flashTimer?: ReturnType<typeof setTimeout>;
  private selectionSyncSeq = 0;
  private flashSeq = 0;
  /** Descarta respostas de GET de uma safra/cidade que já foi trocada. */
  private loadSeq = 0;
  private ticketTouched = false;

  onInit(): void {
    this.getView().setModel(new JSONModel({
      rows: [], cities: [], harvest: "", harvestName: "", city: "", selectedLineId: null, selectedCanBuy: false,
      moduleMessage: "", moduleDisabled: false, statusText: "", statusState: "None", noDataText: "",
    }), "grid");
    this.getView().setModel(new JSONModel({}), "breakdown");
    this.getView().setModel(new JSONModel({}), "ticket");

    this.getRouter().getRoute(ROUTE).attachPatternMatched(() => void this.enter());
    this.getRouter().attachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  onExit(): void {
    this.getRouter().detachBeforeRouteMatched(this.onBeforeRouteMatched, this);
    this.cancelFlashTimer();
    marketPriceGridLive.stop();
  }

  private readonly onBeforeRouteMatched = (ev: Router$BeforeRouteMatchedEvent): void => {
    if (ev.getParameter("name") !== ROUTE) {
      this.loadSeq++;
      this.cancelFlashTimer();
      marketPriceGridLive.stop();
    }
  };

  private model(): JSONModel {
    return this.getView().getModel("grid") as JSONModel;
  }

  private text(key: string, args?: unknown[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  /** Formatter da Situação (texto pt-BR do status). */
  statusText = (status: string): string => (status ? this.text(priceStatusTextKey(status)) : "");

  private userName(): string {
    return (this.getOwnerComponent().getModel("sessionModel") as JSONModel)?.getProperty("/userName") as string;
  }

  private storage(): Storage {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private async enter(): Promise<void> {
    this.bundle ??= await this.getResourceBundle();
    const model = this.model();
    model.setProperty("/moduleDisabled", false);
    this.browserDisconnected = false;

    const cities = await marketFetch<MarketFreightCity[]>("GET", ServerRoutes.marketFreightCities);
    if (!cities.ok) {
      if (cities.status === 404) {
        model.setProperty("/moduleMessage", this.text(notFoundTextKey(cities.moduleDisabled)));
        model.setProperty("/moduleDisabled", true);
        return;
      }
      this.showError(cities);
    }
    const cityList = (cities.data ?? []).map((c) => ({ ...c, label: municipalityLabel(c.name, c.stateAbbreviation) }));
    model.setProperty("/cities", cityList);

    // Safra e cidade lembradas (cidade que saiu da lista de fretes é esquecida).
    if (!model.getProperty("/harvest") && !model.getProperty("/city")) {
      const preference = loadPriceGridPreference(this.storage(), this.userName());
      model.setProperty("/harvest", preference.harvest ?? "");
      model.setProperty("/harvestName", preference.harvestName ?? "");
      model.setProperty("/city", preference.city ?? "");
    }
    if (!cityList.some((c) => c.code === model.getProperty("/city"))) model.setProperty("/city", "");

    if (this.getRouter().getHashChanger().getHash() !== this.getRouter().getURL(ROUTE)) return;
    await this.reload();
  }

  /** (Re)abre o stream para a safra+cidade atuais; sem as duas, esvazia a grade e fecha o stream. */
  private async reload(): Promise<void> {
    const model = this.model();
    const harvest = model.getProperty("/harvest") as string;
    const city = model.getProperty("/city") as string;
    const seq = ++this.loadSeq;
    this.cancelFlashTimer();
    marketPriceGridLive.stop();
    this.previousRows = null;
    this.setSelectedLine(null);
    model.setProperty("/rows", []);
    this.syncTableSelection();

    if (!harvest || !city) {
      model.setProperty("/noDataText", this.text("marketPriceGridChoose"));
      model.setProperty("/statusText", "");
      model.setProperty("/statusState", "None");
      return;
    }
    model.setProperty("/noDataText", this.text("marketPriceGridNoData"));

    // GET inicial: pinta já e detecta 404 do módulo desligado (o EventSource não expõe o status).
    const grid = await marketFetch<MarketPriceGrid>("GET", ServerRoutes.marketPriceGrid(harvest, city));
    if (seq !== this.loadSeq) return;
    if (!grid.ok) {
      if (grid.status === 404 && grid.moduleDisabled) {
        model.setProperty("/moduleMessage", this.text(notFoundTextKey(true)));
        model.setProperty("/moduleDisabled", true);
        return;
      }
      this.showError(grid);
    } else {
      this.applyRows(grid.data?.rows ?? []);
    }
    // O primeiro quadro do stream é nova linha de base: trocar safra/cidade nunca pisca.
    this.previousRows = null;
    this.updateStatus();
    marketPriceGridLive.start<MarketPriceGrid>(ServerRoutes.marketPriceGridLive(harvest, city), {
      onData: (payload) => {
        if (seq !== this.loadSeq) return;
        this.browserDisconnected = false;
        this.updateStatus();
        this.applyRows(payload?.rows ?? []);
      },
      onConnectionChange: (disconnected) => {
        this.browserDisconnected = disconnected;
        if (disconnected) this.previousRows = null;
        this.updateStatus();
      },
    });
  }

  private updateStatus(): void {
    const model = this.model();
    model.setProperty("/statusText", this.text(this.browserDisconnected ? "marketStatusNoServer" : "marketPriceGridLive"));
    model.setProperty("/statusState", this.browserDisconnected ? "Error" : "Success");
  }

  private applyRows(rows: MarketPriceGridRow[]): void {
    const viewRows = withPriceGridFlashes(this.previousRows, rows, ++this.flashSeq, Date.now());
    this.previousRows = viewRows;
    this.model().setProperty("/rows", viewRows);
    this.refreshSelectedState();
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
      const cleared = clearPriceGridFlashes(this.model().getProperty("/rows") as MarketPriceGridRow[]);
      this.previousRows = this.previousRows ? cleared : null;
      this.model().setProperty("/rows", cleared);
    }, FLASH_DURATION_MS);
  }

  private savePreference(): void {
    const model = this.model();
    savePriceGridPreference(this.storage(), this.userName(), {
      harvest: model.getProperty("/harvest") as string,
      harvestName: model.getProperty("/harvestName") as string,
      city: model.getProperty("/city") as string,
    });
  }

  async onPickHarvest(): Promise<void> {
    const ctx = await DialogHelper.openTableSelectDialog(this, "HarvestSeasonsSelectDialog", ["Code", "Name"]);
    if (!ctx) return;
    const model = this.model();
    model.setProperty("/harvest", String(ctx.getProperty("Code")));
    model.setProperty("/harvestName", ctx.getProperty("Name") as string);
    this.changeFilter();
  }

  onCityChange(): void {
    this.changeFilter();
  }

  private changeFilter(): void {
    const model = this.model();
    model.setProperty("/rows", clearPriceGridFlashes(model.getProperty("/rows") as MarketPriceGridRow[]));
    this.savePreference();
    void this.reload();
  }

  // ---- seleção (pela chave lineId, nunca pelo índice) ----

  private table(): Table {
    return this.byId("priceGridTable") as Table;
  }

  private selection(): MultiSelectionPlugin {
    return this.byId("priceGridSelection") as MultiSelectionPlugin;
  }

  onSelectionChange(ev: MultiSelectionPlugin$SelectionChangeEvent): void {
    if ((ev.getParameter("customPayload") as { sync?: boolean })?.sync) return;
    const index = this.selection().getSelectedIndices()[0] ?? -1;
    const lineId = index < 0 ? null : this.table().getContextByIndex(index)?.getProperty("lineId") as number;
    this.setSelectedLine(lineId ?? null);
  }

  private syncTableSelection(): void {
    const binding = this.table()?.getBinding("rows") as ListBinding;
    const selection = this.selection();
    if (!binding || !selection) return;
    const lineId = this.model().getProperty("/selectedLineId") as number;
    const contexts = lineId != null ? binding.getContexts(0, binding.getLength()) : [];
    const index = contexts.findIndex((c) => c?.getProperty("lineId") === lineId);
    const current = selection.getSelectedIndices()[0] ?? -1;
    const seq = ++this.selectionSyncSeq;
    if (index < 0) {
      if (current >= 0) selection.clearSelection({ sync: true });
      if (lineId != null) this.setSelectedLine(null);
    } else if (current !== index) {
      selection.setSelectedIndex(index, { sync: true })
        .then(() => {
          if (seq !== this.selectionSyncSeq) return;
          const selected = selection.getSelectedIndices()[0] ?? -1;
          const selectedId = selected < 0 ? null : this.table().getContextByIndex(selected)?.getProperty("lineId") as number;
          if (selectedId !== this.model().getProperty("/selectedLineId")) this.syncTableSelection();
        })
        .catch(() => { /* contexto indisponível: a próxima atualização tenta de novo */ });
    }
  }

  private setSelectedLine(lineId: number): void {
    this.model().setProperty("/selectedLineId", lineId);
    this.refreshSelectedState();
  }

  private selectedRow(): MarketPriceGridViewRow {
    const lineId = this.model().getProperty("/selectedLineId") as number;
    if (lineId == null) return undefined;
    return (this.model().getProperty("/rows") as MarketPriceGridViewRow[]).find((r) => r.lineId === lineId);
  }

  private refreshSelectedState(): void {
    this.model().setProperty("/selectedCanBuy", canBuy(this.selectedRow()));
  }

  // ---- composição do preço ----

  async onShowBreakdown(): Promise<void> {
    const row = this.selectedRow();
    if (!row) return;
    const steps = (row.steps ?? []).map((step) => {
      const unitKey = stepUnitKey(step.unit);
      return {
        label: this.text(`marketStep_${step.key}`),
        valueText: formatStepValue(step.value, step.unit),
        unitText: unitKey ? this.text(unitKey) : (step.unit ?? ""),
      };
    });
    (this.getView().getModel("breakdown") as JSONModel).setData({
      title: this.text("marketPriceBreakdownTitle", [row.lineDescription]),
      instrumentCode: row.instrumentCode ?? "",
      quoteText: formatQuoteValue(row.exchangeQuote),
      quoteSource: row.quoteSource,
      quotedAt: row.quotedAt,
      steps,
    });
    this.breakdownDialog ??= await this.loadFragment({ name: "siagrob1.view.marketPriceGrid.fragments.PriceBreakdown" }) as Dialog;
    this.breakdownDialog.open();
  }

  onCloseBreakdown(): void {
    this.breakdownDialog?.close();
  }

  // ---- boleta ("Comprar") ----

  private ticketModel(): JSONModel {
    return this.getView().getModel("ticket") as JSONModel;
  }

  async onBuy(): Promise<void> {
    const row = this.selectedRow();
    if (!canBuy(row)) return;
    const model = this.model();
    const city = (model.getProperty("/cities") as (MarketFreightCity & { label: string })[])
      .find((c) => c.code === model.getProperty("/city"));
    const branch = SessionService.getBranchInfo();
    const form: MarketTicketForm = {
      cardCode: "", cardName: "", sacks: "",
      negotiatedPrice: row.price.toLocaleString("pt-BR", { useGrouping: false, maximumFractionDigits: 2 }),
      warehouseCode: "", warehouseName: "", agentCode: "", agentName: "",
      branchCode: branch?.code ?? "", branchName: branch?.shortName ?? branch?.branchName ?? "",
      logisticRegionCode: "", logisticRegionName: "", notes: "",
    };
    // Cópia da linha: o stream continua trocando a grade enquanto o diálogo está aberto.
    this.ticketModel().setData({ row: { ...row }, cityCode: city?.code, cityLabel: city?.label ?? "", form, tonsText: "", deviationText: "" });
    this.ticketDialog ??= await this.loadFragment({ name: "siagrob1.view.marketPriceGrid.fragments.TradeTicketDialog" }) as Dialog;
    this.ticketTouched = false;
    this.validateTicket(false);
    this.ticketDialog.open();
  }

  onTicketChange(): void {
    this.validateTicket(this.ticketTouched);
  }

  /** Atualiza t equivalente e desvio; marca os campos (obrigatório só depois da 1ª tentativa de gravar). */
  private validateTicket(showRequired: boolean): ReturnType<typeof buildTicketPayload> {
    const data = this.ticketModel().getData() as { row: MarketPriceGridRow; cityCode: string; form: MarketTicketForm };
    const sacks = parseStrictDecimal(data.form.sacks);
    const tons = sacks.error ? null : sacksToTons(sacks.value);
    this.ticketModel().setProperty("/tonsText", tons == null ? ""
      : this.text("marketTicketTons", [tons.toLocaleString("pt-BR", { maximumFractionDigits: 3 })]));
    const price = parseStrictDecimal(data.form.negotiatedPrice);
    const deviation = price.error ? null : priceDeviationPercent(price.value, data.row.price);
    this.ticketModel().setProperty("/deviationText", deviation == null ? ""
      : this.text("marketTicketDeviation", [`${deviation > 0 ? "+" : ""}${deviation.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`]));

    const result = buildTicketPayload(data.form, data.row.lineId, data.cityCode);
    for (const [field, id] of Object.entries(TICKET_INPUTS)) {
      const error = result.errors[field as keyof MarketTicketForm];
      const show = error && (showRequired || error !== "required");
      const input = this.byId(id) as Input;
      input?.setValueState(show ? "Error" : "None");
      input?.setValueStateText(show ? this.text(ticketErrorKey(error)) : "");
    }
    return result;
  }

  private setTicketField(field: keyof MarketTicketForm, value: string): void {
    this.ticketModel().setProperty(`/form/${field}`, value ?? "");
  }

  async onPickPartner(): Promise<void> {
    // Mesmo filtro do contrato de compra: só fornecedores.
    const ctx = await DialogHelper.openTableSelectDialog(this, "SuppliersSelectDialog", ["CardCode", "CardName", "CardFName"],
      [new Filter("CardType", FilterOperator.EQ, "S")]);
    if (!ctx) return;
    this.setTicketField("cardCode", ctx.getProperty("CardCode") as string);
    this.setTicketField("cardName", ctx.getProperty("CardName") as string);
    this.onTicketChange();
  }

  async onPickWarehouse(): Promise<void> {
    const ctx = await DialogHelper.openTableSelectDialog(this, "WarehousesSelectDialog", ["Code", "Name", "TaxId", "FName"]);
    if (!ctx) return;
    this.setTicketField("warehouseCode", String(ctx.getProperty("Code")));
    this.setTicketField("warehouseName", ctx.getProperty("Name") as string);
    this.onTicketChange();
  }

  async onPickAgent(): Promise<void> {
    const ctx = await DialogHelper.openTableSelectDialog(this, "AgentsSelectDialog", ["Name"],
      [new Filter("Inactive", FilterOperator.EQ, "N")]);
    if (!ctx) return;
    this.setTicketField("agentCode", String(ctx.getProperty("Code")));
    this.setTicketField("agentName", ctx.getProperty("Name") as string);
    this.onTicketChange();
  }

  async onPickBranch(): Promise<void> {
    const ctx = await DialogHelper.openTableSelectDialog(this, "BranchsSelectDialog", ["Code", "BranchName", "ShortName", "TaxId"]);
    if (!ctx) return;
    this.setTicketField("branchCode", String(ctx.getProperty("Code")));
    this.setTicketField("branchName", (ctx.getProperty("ShortName") ?? ctx.getProperty("BranchName")) as string);
    this.onTicketChange();
  }

  async onPickLogisticRegion(): Promise<void> {
    const ctx = await DialogHelper.openTableSelectDialog(this, "LogisticRegionsSelectDialog", ["Code", "Name"]);
    if (!ctx) return;
    this.setTicketField("logisticRegionCode", String(ctx.getProperty("Code")));
    this.setTicketField("logisticRegionName", ctx.getProperty("Name") as string);
    this.onTicketChange();
  }

  onTicketCancel(): void {
    this.ticketDialog?.close();
  }

  async onTicketSubmit(): Promise<void> {
    this.ticketTouched = true;
    const { payload } = this.validateTicket(true);
    if (!payload) {
      MessageBox.warning(this.text("marketTicketInvalid"));
      return;
    }
    this.ticketDialog?.setBusy(true);
    let result: MarketResult<MarketTradeTicketCreated>;
    try {
      result = await marketFetch<MarketTradeTicketCreated>("POST", ServerRoutes.marketTickets, payload);
    } finally {
      this.ticketDialog?.setBusy(false);
    }
    if (!result.ok) {
      this.showError(result);
      return;
    }
    this.ticketDialog?.close();
    const ticket = result.data;
    if (ticket?.requiresBoardApproval) {
      await new Promise<void>((resolve) => MessageBox.information(
        this.text("marketTicketBoardApproval", [ticket.boardApprovalReason ?? ""]), { onClose: () => resolve() }));
    }
    // A rota do detalhe pode ainda não existir nesta versão: sem ela, avisa e fica na grade.
    if (ticket?.id != null && this.getRouter().getRoute(TICKET_DETAIL_ROUTE)) {
      MessageToast.show(this.text("marketTicketCreated", [ticket.id]), { closeOnBrowserNavigation: false });
      this.navTo(TICKET_DETAIL_ROUTE, { id: ticket.id });
    } else {
      MessageToast.show(this.text("marketTicketCreated", [ticket?.id ?? ""]));
    }
  }

  private showError(result: MarketResult): void {
    if (result.status === 404) {
      MessageBox.warning(this.text(notFoundTextKey(result.moduleDisabled)));
      return;
    }
    MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }
}
