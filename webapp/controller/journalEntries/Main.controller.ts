import CommonController from "siagrob1/controller/common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import Filter from "sap/ui/model/Filter";
import Sorter from "sap/ui/model/Sorter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Link$PressEvent } from "sap/m/Link";
import Context from "sap/ui/model/odata/v4/Context";
import { monthRange } from "siagrob1/helpers/FinancialAccountMovementHelpers";
import { JournalLine, firstHistory, formatMoney, originText, totalDebit } from "./JournalEntryFormat";

type ListFilter = { DateFrom: string; DateTo: string; Batch: string; Origin: string; BranchCode: string };

/**
 * Lançamentos contábeis (CT2): consulta por período, lote, origem e filial; abre o detalhe e inclui manual.
 * As linhas são ligadas no código (bindRows) já com o filtro do período, e não no XML com `suspended: true`: ao sair
 * da tela o roteador tira a view do container, o binding é destruído e, na volta, o UI5 o recria a partir da
 * definição. Recriado suspenso, a tabela renderizava antes do resume e abortava ("root binding is suspended").
 *
 * @namespace siagrob1.controller.journalEntries
 */
export default class Main extends CommonController {
  originText = originText;

  onInit(): void {
    const { from, to } = monthRange(new Date());
    this.getView().setModel(new JSONModel({ DateFrom: from, DateTo: to, Batch: "", Origin: "", BranchCode: "" }), "filter");
    this.getRouter().getRoute("journalEntries").attachPatternMatched(() => this.onRefresh());
  }

  firstHistory(lines: JournalLine[]): string {
    return firstHistory(lines);
  }

  totalDebit(lines: JournalLine[]): string {
    return formatMoney(totalDebit(lines));
  }

  onRefresh(): void {
    const f = (this.getView().getModel("filter") as JSONModel).getData() as ListFilter;
    const filters: Filter[] = [];
    // PostingDate é Edm.Date: o filtro compara a data pura (yyyy-MM-dd).
    if (f.DateFrom) filters.push(new Filter("PostingDate", FilterOperator.GE, f.DateFrom));
    if (f.DateTo) filters.push(new Filter("PostingDate", FilterOperator.LE, f.DateTo));
    if (f.Batch?.trim()) filters.push(new Filter("Batch", FilterOperator.EQ, f.Batch.trim()));
    if (f.Origin) filters.push(new Filter("Origin", FilterOperator.EQ, f.Origin));
    if (f.BranchCode?.trim()) filters.push(new Filter("BranchCode", FilterOperator.EQ, f.BranchCode.trim()));

    // Filtros no mesmo campo (PostingDate de/até) viram OU no UI5 se forem soltos: agrupa tudo com E.
    (this.byId("journalEntriesTable") as Table).bindRows({
      path: "/JournalEntries",
      parameters: { $expand: "Lines($select=LineNumber,EntryType,Amount,History)" },
      sorter: [new Sorter("PostingDate", true), new Sorter("DocEntry", true)],
      filters: filters.length ? [new Filter({ filters, and: true })] : [],
    });
  }

  onOpen(ev: Link$PressEvent): void {
    const ctx = ev.getSource().getBindingContext() as Context;
    this.navTo("journalEntriesDetail", { id: String(ctx.getProperty("DocEntry")) });
  }

  onCreate(): void {
    this.navTo("journalEntriesNew");
  }
}
