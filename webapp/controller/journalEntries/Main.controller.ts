import CommonController from "siagrob1/controller/common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Link$PressEvent } from "sap/m/Link";
import Context from "sap/ui/model/odata/v4/Context";
import { monthRange } from "siagrob1/helpers/FinancialAccountMovementHelpers";
import { JournalLine, firstHistory, formatMoney, originText, totalDebit } from "./JournalEntryFormat";

type ListFilter = { DateFrom: string; DateTo: string; Batch: string; Origin: string; BranchCode: string };

/**
 * Lançamentos contábeis (CT2): consulta por período, lote, origem e filial; abre o detalhe e inclui manual.
 * O binding nasce suspenso e só busca depois que o filtro do período é aplicado.
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

  private binding(): ODataListBinding {
    return (this.byId("journalEntriesTable") as Table).getBinding("rows") as ODataListBinding;
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
    // PostingDate é DATE no banco mas Edm.DateTimeOffset no EDM: compara pelo dia inteiro.
    if (f.DateFrom) filters.push(new Filter("PostingDate", FilterOperator.GE, `${f.DateFrom}T00:00:00Z`));
    if (f.DateTo) filters.push(new Filter("PostingDate", FilterOperator.LE, `${f.DateTo}T23:59:59Z`));
    if (f.Batch?.trim()) filters.push(new Filter("Batch", FilterOperator.EQ, f.Batch.trim()));
    if (f.Origin) filters.push(new Filter("Origin", FilterOperator.EQ, f.Origin));
    if (f.BranchCode?.trim()) filters.push(new Filter("BranchCode", FilterOperator.EQ, f.BranchCode.trim()));

    const binding = this.binding();
    binding.filter(filters);
    if (binding.isSuspended()) binding.resume();
    else binding.refresh();
  }

  onOpen(ev: Link$PressEvent): void {
    const ctx = ev.getSource().getBindingContext() as Context;
    this.navTo("journalEntriesDetail", { id: String(ctx.getProperty("DocEntry")) });
  }

  onCreate(): void {
    this.navTo("journalEntriesNew");
  }
}
