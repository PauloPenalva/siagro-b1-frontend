import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { Link$PressEvent } from "sap/m/Link";
import Sorter from "sap/ui/model/Sorter";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import GridTable from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import {
  OPEN_TICKET_STATUSES, TICKET_STATUSES, TicketsFilter, buildTicketsFilter, ticketStatusTextKey
} from "siagrob1/helpers/MarketTicketHelpers";
import BaseController from "../BaseController";

const ROUTE = "marketTradeTickets";
const DETAIL_ROUTE = "marketTradeTicketsDetail";

/**
 * Lista de boletas do módulo Mercado. Nasce filtrada nas boletas em aberto (Pendente + Aguardando diretoria);
 * "Ver todas" limpa a situação. Os filtros vão como `$filter` cru porque `Status` é enum.
 * @namespace siagrob1.controller.marketTradeTickets
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;

  /** Texto da situação (campo de instância, não getter: o UI5 resolve `.statusText` por nome). */
  statusText = (status: string): string => (status ? this.text(ticketStatusTextKey(status)) : "");

  onInit(): void {
    this.getView().setModel(new JSONModel(this.defaultFilter()), "filter");
    this.getView().setModel(new JSONModel([]), "statuses");

    const table = this.byId("ticketsTable") as GridTable;
    table.bindRows({
      path: "/MarketTradeTickets",
      parameters: {
        $select: "Id,CreatedAt,Status,CardCode,CardName,ItemName,VolumeKg,NegotiatedPrice,CalculatedPrice,DeviationPercent,PurchaseContractCode",
        $expand: "Municipality($select=Name,StateAbbreviation)",
        $filter: buildTicketsFilter(this.filter().getData() as TicketsFilter),
      },
      sorter: new Sorter("CreatedAt", true),
    });

    this.getRouter().getRoute(ROUTE).attachPatternMatched(() => void this.enter());
  }

  private async enter(): Promise<void> {
    this.bundle ??= await this.getResourceBundle();
    (this.getView().getModel("statuses") as JSONModel).setData(
      TICKET_STATUSES.map((key) => ({ key, text: this.text(ticketStatusTextKey(key)) })));
    // Voltando do detalhe, a situação da boleta pode ter mudado.
    this.binding()?.refresh();
  }

  private text(key: string, args?: unknown[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  private defaultFilter(): TicketsFilter {
    return { Statuses: [...OPEN_TICKET_STATUSES] };
  }

  private filter(): JSONModel {
    return this.getView().getModel("filter") as JSONModel;
  }

  private binding(): ODataListBinding {
    return (this.byId("ticketsTable") as GridTable).getBinding("rows") as ODataListBinding;
  }

  private applyFilters(): void {
    this.binding()?.changeParameters({ $filter: buildTicketsFilter(this.filter().getData() as TicketsFilter) });
  }

  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.filter().setData(this.defaultFilter());
    this.applyFilters();
  }

  /** Atalho para sair do filtro padrão: todas as situações, mantendo os demais filtros. */
  onShowAll(): void {
    this.filter().setProperty("/Statuses", []);
    this.applyFilters();
  }

  onRefresh(): void {
    this.binding()?.refresh();
  }

  async onPickHarvest(): Promise<void> {
    const ctx = await DialogHelper.openTableSelectDialog(this, "HarvestSeasonsSelectDialog", ["Code", "Name"]);
    if (ctx) {
      this.filter().setProperty("/HarvestSeasonCode", ctx.getProperty("Code"));
      this.filter().setProperty("/HarvestName", ctx.getProperty("Name"));
    }
  }

  async onPickPartner(): Promise<void> {
    const ctx = await DialogHelper.openTableSelectDialog(this, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"]);
    if (ctx) {
      this.filter().setProperty("/CardCode", ctx.getProperty("CardCode"));
      this.filter().setProperty("/CardName", ctx.getProperty("CardName"));
    }
  }

  onOpen(ev: Link$PressEvent): void {
    const ctx = ev.getSource().getBindingContext() as Context;
    this.navTo(DETAIL_ROUTE, { id: String(ctx.getProperty("Id")) });
  }
}
