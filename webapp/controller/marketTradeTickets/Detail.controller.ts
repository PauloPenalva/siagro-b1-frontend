import ResourceBundle from "sap/base/i18n/ResourceBundle";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import {
  formatQuoteValue, marketFetch, MarketResult, notFoundTextKey, ticketActions, TicketPermissions
} from "siagrob1/helpers/MarketHelpers";
import { formatDeliveryRange, formatFx, formatIsoDate, quoteSourceText, stepUnitKey } from "siagrob1/helpers/MarketPriceGridHelpers";
import {
  cityLabel, deviationState, formatDeviation, formatLocalDateTime, formatMoneyValue, formatSacks, formatTons,
  normalizeTicketStatus, parseTicketSteps, ticketStatusIcon, ticketStatusState, ticketStatusTextKey, ticketTotalValue,
  toPascalKeys
} from "siagrob1/helpers/MarketTicketHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { MarketTradeTicketActionResult, MarketTradeTicketEntity } from "siagrob1/types/MarketTradeTicket";
import BaseController from "../BaseController";

const ROUTE = "marketTradeTicketsDetail";
const LIST_ROUTE = "marketTradeTickets";
const PERMISSION_APPROVE = "MARKET_TICKET_APPROVE";
const PERMISSION_BOARD_APPROVE = "MARKET_BOARD_APPROVE";
const EXPAND = "$expand=Municipality($select=Name,StateAbbreviation),HarvestSeason($select=Name)";

type TicketAction = "approve" | "reject" | "cancel";

/**
 * Detalhe da boleta (somente leitura) com aprovar, rejeitar e cancelar. O servidor decide quem pode; a tela só
 * evita oferecer o botão que voltaria recusado (`ticketActions`). Depois de qualquer ação a boleta é relida.
 * @namespace siagrob1.controller.marketTradeTickets
 */
export default class Detail extends BaseController {
  private bundle?: ResourceBundle;
  private ticketId: number = null;
  private breakdownDialog?: Dialog;
  /** Trava de clique duplo: uma ação por vez, do clique até a boleta ser relida. */
  private acting = false;
  /** Descarta resposta de uma boleta que já foi trocada. */
  private loadSeq = 0;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "ticket");
    this.getView().setModel(new JSONModel({ approve: false, reject: false, cancel: false }), "act");
    this.getView().setModel(new JSONModel({}), "breakdown");
    this.getRouter().getRoute(ROUTE).attachPatternMatched((ev: Route$PatternMatchedEvent) => {
      const args = ev.getParameter("arguments") as { id: string };
      void this.enter(args.id);
    });
  }

  private text(key: string, args?: unknown[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  private ticketModel(): JSONModel {
    return this.getView().getModel("ticket") as JSONModel;
  }

  private userName(): string {
    return (this.getOwnerComponent().getModel("sessionModel") as JSONModel)?.getProperty("/userName") as string;
  }

  private async enter(rawId: string): Promise<void> {
    this.bundle ??= await this.getResourceBundle();
    this.acting = false;
    this.ticketModel().setData({});
    this.applyActions(null);
    const id = /^\d+$/.test(rawId ?? "") ? Number(rawId) : NaN;
    if (!Number.isInteger(id)) {
      this.notFound(this.text("marketTicketNotFound"));
      return;
    }
    this.ticketId = id;
    await this.load();
  }

  private notFound(message: string): void {
    MessageBox.warning(message, { onClose: () => this.navTo(LIST_ROUTE, {}, true) });
  }

  /** Lê a boleta no OData. Devolve `false` quando não há o que mostrar (já avisou o usuário). */
  private async load(): Promise<boolean> {
    const seq = ++this.loadSeq;
    const result = await marketFetch<unknown>("GET", `${ServerRoutes.marketTradeTicket(this.ticketId)}?${EXPAND}`);
    if (seq !== this.loadSeq) return false;
    if (!result.ok) {
      if (result.status === 404) {
        this.notFound(this.text(result.moduleDisabled ? notFoundTextKey(true) : "marketTicketNotFound"));
      } else {
        MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketTicketLoadError"));
      }
      return false;
    }
    const entity = toPascalKeys<MarketTradeTicketEntity>(result.data);
    this.ticketModel().setData(this.toView(entity));
    this.applyActions(entity);
    return true;
  }

  private applyActions(entity: MarketTradeTicketEntity): void {
    const permissions: TicketPermissions = {
      approve: SessionService.hasPermission(PERMISSION_APPROVE),
      boardApprove: SessionService.hasPermission(PERMISSION_BOARD_APPROVE),
    };
    const me = (this.userName() ?? "").toLowerCase();
    const isCreator = !!entity && !!me && (entity.CreatedBy ?? "").toLowerCase() === me;
    (this.getView().getModel("act") as JSONModel).setData(ticketActions(entity?.Status, permissions, isCreator));
  }

  private byAt(user: string, when: string): string {
    return user ? this.text("marketTicketByAt", [user, formatLocalDateTime(when)]) : "";
  }

  private toView(t: MarketTradeTicketEntity): Record<string, unknown> {
    const city = cityLabel(t.Municipality?.Name, t.Municipality?.StateAbbreviation);
    const total = ticketTotalValue(t.VolumeKg, t.NegotiatedPrice);
    const code = (value: string, name: string): string => (value ? (name ? `${value} - ${name}` : value) : "");
    return {
      title: this.text("marketTicketDetailTitle", [t.Id]),
      statusText: this.text(ticketStatusTextKey(t.Status)),
      statusState: ticketStatusState(t.Status),
      statusIcon: ticketStatusIcon(t.Status),
      partnerText: code(t.CardCode, t.CardName),
      itemText: code(t.ItemCode, t.ItemName),
      harvestText: code(t.HarvestSeasonCode, t.HarvestSeason?.Name),
      cityText: city,
      destinationText: t.DestinationName ? `${city} / ${t.DestinationName}` : city,
      destinationName: t.DestinationName ?? "",
      requiresBoard: t.RequiresBoardApproval === true,
      boardStripText: this.text("marketTicketBoardStrip", [t.BoardApprovalReason ?? ""]),
      sacksText: formatSacks(t.VolumeKg),
      tonsText: formatTons(t.VolumeKg),
      negotiatedText: formatMoneyValue(t.NegotiatedPrice),
      calculatedText: formatMoneyValue(t.CalculatedPrice),
      deviationText: formatDeviation(t.DeviationPercent),
      deviationState: deviationState(t.DeviationPercent),
      totalText: formatMoneyValue(total),
      warehouseText: code(t.WarehouseCode, t.WarehouseName),
      agentText: code(t.AgentCode == null ? "" : String(t.AgentCode), t.AgentName),
      branchCode: t.BranchCode ?? "",
      logisticRegionCode: t.LogisticRegionCode ?? "",
      notes: t.Notes ?? "",
      createdText: this.byAt(t.CreatedBy, t.CreatedAt),
      quoteText: `${t.InstrumentCode ?? ""} ${formatQuoteValue(Number(t.ExchangeQuote))}`.trim(),
      premiumText: formatQuoteValue(Number(t.Premium)),
      netFxText: t.NetFx == null ? "–" : formatFx(Number(t.NetFx)),
      spotFxText: t.SpotFx == null ? "–" : formatFx(Number(t.SpotFx)),
      portPriceText: formatMoneyValue(t.PortPrice),
      freightText: formatMoneyValue(t.FreightPerTon),
      quotedAtText: formatLocalDateTime(t.QuotedAt),
      quoteSourceText: quoteSourceText(t.QuoteSource),
      deliveryText: formatDeliveryRange(t.DeliveryStartDate, t.DeliveryEndDate),
      receiptText: formatIsoDate(t.ReceiptDate),
      paymentText: formatIsoDate(t.PaymentDate),
      hasApproval: !!t.ApprovedBy,
      approvedText: this.byAt(t.ApprovedBy, t.ApprovedAt),
      hasBoardApproval: !!t.BoardApprovedBy,
      boardApprovedText: this.byAt(t.BoardApprovedBy, t.BoardApprovedAt),
      hasRejection: !!t.RejectedBy,
      rejectedText: this.byAt(t.RejectedBy, t.RejectedAt),
      rejectionReason: t.RejectionReason ?? "",
      hasCancellation: !!t.CanceledBy,
      canceledText: this.byAt(t.CanceledBy, t.CanceledAt),
      hasContract: !!t.PurchaseContractKey,
      contractCode: t.PurchaseContractCode ?? "",
      contractKey: t.PurchaseContractKey ?? "",
      // Dados crus de que as ações precisam (resumo da confirmação, composição do cálculo).
      raw: { id: t.Id, status: t.Status, stepsJson: t.StepsJson ?? "", instrumentCode: t.InstrumentCode ?? "", quoteText: formatQuoteValue(Number(t.ExchangeQuote)), quoteSource: t.QuoteSource ?? "", quotedAt: t.QuotedAt ?? "" },
    };
  }

  onBack(): void {
    this.navTo(LIST_ROUTE, {}, true);
  }

  onOpenContract(): void {
    const key = this.ticketModel().getProperty("/contractKey") as string;
    if (key) this.navTo("purchaseContractsDetail", { id: key });
  }

  // ---- composição do cálculo (reaproveita o diálogo da grade de preços) ----

  async onShowSteps(): Promise<void> {
    const model = this.ticketModel();
    const steps = parseTicketSteps(model.getProperty("/raw/stepsJson") as string).map((step) => {
      const unitKey = stepUnitKey(step.unit);
      return { label: this.text(`marketStep_${step.key}`), value: step.value, unitText: unitKey ? this.text(unitKey) : (step.unit ?? "") };
    });
    (this.getView().getModel("breakdown") as JSONModel).setData({
      title: model.getProperty("/title") as string,
      instrumentCode: model.getProperty("/raw/instrumentCode") as string,
      quoteText: model.getProperty("/raw/quoteText") as string,
      quoteSource: model.getProperty("/raw/quoteSource") as string,
      quotedAt: model.getProperty("/raw/quotedAt") as string,
      steps,
    });
    this.breakdownDialog ??= await this.loadFragment({ name: "siagrob1.view.marketPriceGrid.fragments.PriceBreakdown" }) as Dialog;
    this.breakdownDialog.open();
  }

  onCloseBreakdown(): void {
    this.breakdownDialog?.close();
  }

  // ---- aprovar / rejeitar / cancelar ----

  async onApprove(): Promise<void> {
    if (this.acting) return;
    const model = this.ticketModel();
    const confirmed = await confirmDialog(
      this.text("marketTicketApproveConfirm", [
        this.ticketId, model.getProperty("/partnerText"), model.getProperty("/sacksText"), model.getProperty("/negotiatedText")]),
      this.text("marketTicketApproveTitle"));
    if (!confirmed) return;
    await this.run("approve", () => marketFetch<MarketTradeTicketActionResult>("POST", ServerRoutes.marketTicketApprove(this.ticketId)));
  }

  async onReject(): Promise<void> {
    if (this.acting) return;
    const reason = (await DialogHelper.promptDialog(this.text("marketTicketRejectTitle"), this.text("marketTicketRejectLabel")))?.trim();
    if (!reason) return;
    await this.run("reject", () => marketFetch<MarketTradeTicketActionResult>("POST", ServerRoutes.marketTicketReject(this.ticketId), { reason }));
  }

  async onCancel(): Promise<void> {
    if (this.acting) return;
    const confirmed = await confirmDialog(
      this.text("marketTicketCancelConfirm", [this.ticketId]), this.text("marketTicketCancelTitle"));
    if (!confirmed) return;
    await this.run("cancel", () => marketFetch<MarketTradeTicketActionResult>("POST", ServerRoutes.marketTicketCancel(this.ticketId)));
  }

  private async run(action: TicketAction, call: () => Promise<MarketResult<MarketTradeTicketActionResult>>): Promise<void> {
    if (this.acting) return;
    this.acting = true;
    this.setBusy(true);
    try {
      const result = await call();
      if (!result.ok) {
        this.showError(result);
        // Recusa do servidor (ex.: contrato não gerado): a boleta segue aberta, mas pode ter mudado de situação.
        if (result.status !== 0 && result.status !== 404) await this.load();
        return;
      }
      await this.load();
      this.toast(action, result.data);
    } finally {
      this.acting = false;
      this.setBusy(false);
    }
  }

  private toast(action: TicketAction, data: MarketTradeTicketActionResult): void {
    const options = { closeOnBrowserNavigation: false };
    if (action === "approve") {
      if (normalizeTicketStatus(data?.status) === "approved" && data?.purchaseContractCode) {
        MessageToast.show(this.text("marketTicketApprovedWithContract", [this.ticketId, data.purchaseContractCode]), options);
      } else if (normalizeTicketStatus(data?.status) === "approved") {
        MessageToast.show(this.text("marketTicketApproved", [this.ticketId]), options);
      }
      // Aprovação de 1º nível que segue para a diretoria: a nova situação já aparece no cabeçalho.
      return;
    }
    MessageToast.show(this.text(action === "reject" ? "marketTicketRejected" : "marketTicketCanceled", [this.ticketId]), options);
  }

  private showError(result: MarketResult): void {
    if (result.status === 404) {
      MessageBox.warning(this.text(result.moduleDisabled ? notFoundTextKey(true) : "marketTicketNotFound"));
      return;
    }
    MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }
}
