import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import CommonController from "../common/CommonController";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  FiscalReconciliationInvoiceLine, FiscalReconciliationTransaction,
} from "siagrob1/types/PurchaseFiscalReconciliation";

type FiscalFilter = {
  CardCode: string; CardName: string; ItemCode: string; ItemName: string; ContractCode: string;
  DateFrom: string; DateTo: string; Statuses: string[]; IssuerCardCode: string; IncludeFullyLinked: boolean;
};

/** Literal de string OData: aspas simples, ' dobrado, e codificado para a URL. */
const odataString = (value: string): string =>
  `'${encodeURIComponent((value ?? "").replace(/'/g, "''"))}'`;

/**
 * Conciliação Fiscal de Compras (spec 2026-10-13): NF do fornecedor × romaneio de compra (8/9/10/16/17), N:N com
 * quantidade. Só conciliação — não mexe em saldo. Fornecedor e produto vão ao servidor; Situação filtra no cliente.
 *
 * @namespace siagrob1.controller.purchaseFiscalReconciliations
 */
export default class Main extends CommonController {

  onInit(): void {
    this.createFilterModel(Main.defaultFilter());
    this.getView().setModel(new JSONModel(Main.emptyData()), "fiscal");

    this.getRouter().getRoute("purchaseFiscalReconciliations")
      .attachPatternMatched((ev: Route$PatternMatchedEvent) => this.routeMatched(ev));
  }

  private static defaultFilter(): FiscalFilter {
    return {
      CardCode: "", CardName: "", ItemCode: "", ItemName: "", ContractCode: "", DateFrom: "", DateTo: "",
      Statuses: [], IssuerCardCode: "", IncludeFullyLinked: false,
    };
  }

  private static emptyData() {
    return {
      transactions: [] as FiscalReconciliationTransaction[], allTransactions: [] as FiscalReconciliationTransaction[],
      invoiceLines: [] as FiscalReconciliationInvoiceLine[], transactionCount: 0, busy: false,
    };
  }

  /** A aba Entregas abre a tela já filtrada: ?cardCode=&itemCode=&contractCode=. */
  private routeMatched(ev: Route$PatternMatchedEvent): void {
    const query = (ev.getParameter("arguments") as { "?query"?: Record<string, string> })["?query"];
    if (!query?.cardCode) return;

    this.createFilterModel({
      ...Main.defaultFilter(),
      CardCode: query.cardCode, ItemCode: query.itemCode ?? "", ContractCode: query.contractCode ?? "",
    });
    void this.load();
  }

  onSearch(): void {
    void this.load();
  }

  onClearFilters(): void {
    this.createFilterModel(Main.defaultFilter());
    (this.getModel("fiscal") as JSONModel).setData(Main.emptyData());
  }

  onStatusChange(): void {
    this.applyStatusFilter();
  }

  protected filterData(): FiscalFilter {
    return (this.getModel("filter") as JSONModel).getData() as FiscalFilter;
  }

  async load(): Promise<void> {
    const f = this.filterData();
    const model = this.getModel("fiscal") as JSONModel;

    if (!f.CardCode || !f.ItemCode) {
      MessageBox.warning("Informe o fornecedor e o produto.");
      return;
    }

    const common = `CardCode=${odataString(f.CardCode)},ItemCode=${odataString(f.ItemCode)},` +
      `ContractCode=${odataString(f.ContractCode)},DateFrom=${odataString(f.DateFrom)},DateTo=${odataString(f.DateTo)}`;

    model.setProperty("/busy", true);
    const [transactions, lines] = await Promise.all([
      sendJson("GET", `${this.api.purchaseFiscalReconciliationTransactions}(${common})`),
      sendJson("GET", `${this.api.purchaseFiscalReconciliationInvoiceLines}(${common},` +
        `IssuerCardCode=${odataString(f.IssuerCardCode)},IncludeFullyLinked=${f.IncludeFullyLinked ? "true" : "false"})`),
    ]);
    model.setProperty("/busy", false);

    if (!transactions.ok || !lines.ok) {
      MessageBox.error((transactions.ok ? lines.message : transactions.message) ?? "Erro ao carregar a conciliação.");
      return;
    }

    model.setProperty("/allTransactions", odataValue<FiscalReconciliationTransaction[]>(transactions.data) ?? []);
    model.setProperty("/invoiceLines", odataValue<FiscalReconciliationInvoiceLine[]>(lines.data) ?? []);
    this.applyStatusFilter();
    (this.byId("fiscalTransactionsTable") as Table).clearSelection();
    (this.byId("fiscalInvoiceLinesTable") as Table).clearSelection();
  }

  private applyStatusFilter(): void {
    const model = this.getModel("fiscal") as JSONModel;
    const statuses = this.filterData().Statuses ?? [];
    const all = model.getProperty("/allTransactions") as FiscalReconciliationTransaction[];
    const rows = statuses.length ? all.filter(t => statuses.includes(t.Status)) : all;
    model.setProperty("/transactions", rows);
    model.setProperty("/transactionCount", rows.length);
  }

  selectedTransactions(): FiscalReconciliationTransaction[] {
    return this.selectedOf<FiscalReconciliationTransaction>("fiscalTransactionsTable");
  }

  selectedInvoiceLines(): FiscalReconciliationInvoiceLine[] {
    return this.selectedOf<FiscalReconciliationInvoiceLine>("fiscalInvoiceLinesTable");
  }

  private selectedOf<T>(tableId: string): T[] {
    const table = this.byId(tableId) as Table;
    return table.getSelectedIndices()
      .map(i => table.getContextByIndex(i)?.getObject() as T)
      .filter(Boolean);
  }
}
