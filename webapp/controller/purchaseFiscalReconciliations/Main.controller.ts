import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import { Button$PressEvent } from "sap/m/Button";
import { Link$PressEvent } from "sap/m/Link";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { EdmType } from "sap/ui/export/library";
import CommonController from "../common/CommonController";
import { FetchResult, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  FiscalReconciliationInvoiceLine, FiscalReconciliationLink, FiscalReconciliationPair, FiscalReconciliationTransaction,
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
  private _linkDialog: Dialog;
  private _linksDialog: Dialog;

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

  private async dialog(name: "LinkDialog" | "LinksDialog"): Promise<Dialog> {
    const view = this.getView();
    const dialog = await Fragment.load({
      name: `siagrob1.view.purchaseFiscalReconciliations.fragments.${name}`,
      controller: this,
      id: view.getId(),
    }) as Dialog;
    view.addDependent(dialog);
    return dialog;
  }

  async onLink(): Promise<void> {
    const lines = this.selectedInvoiceLines();
    const transactions = this.selectedTransactions();
    if (!lines.length || !transactions.length) {
      MessageBox.information("Selecione ao menos uma linha de NF e um romaneio.");
      return;
    }

    const result = await sendJson("POST", this.api.purchaseFiscalReconciliationSuggest, {
      InvoiceItemKeys: lines.map(l => l.PurchaseInvoiceItemKey),
      TransactionKeys: transactions.map(t => t.Key),
    });
    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    const pairs = odataValue<FiscalReconciliationPair[]>(result.data) ?? [];
    if (!pairs.length) {
      MessageBox.information("Nenhum par possível: confira o tipo da NF (normal × devolução) e dos romaneios.");
      return;
    }

    this._linkDialog ??= await this.dialog("LinkDialog");
    this.getView().setModel(new JSONModel({ pairs, busy: false }), "link");
    this._linkDialog.open();
  }

  async onSaveLinks(): Promise<void> {
    const model = this.getModel("link") as JSONModel;
    const pairs = model.getProperty("/pairs") as FiscalReconciliationPair[];

    model.setProperty("/busy", true);
    const result = await sendJson("POST", this.api.purchaseFiscalReconciliationSave, {
      InvoiceItemKeys: pairs.map(p => p.PurchaseInvoiceItemKey),
      TransactionKeys: pairs.map(p => p.StorageTransactionKey),
      Quantities: pairs.map(p => Number(p.Quantity) || 0),
    });
    model.setProperty("/busy", false);

    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    this._linkDialog.close();
    await this.load();
  }

  onCloseLinkDialog(): void {
    this._linkDialog.close();
  }

  async onOpenLinks(ev: Button$PressEvent): Promise<void> {
    const transaction = ev.getSource().getBindingContext("fiscal").getObject() as FiscalReconciliationTransaction;
    this._linksDialog ??= await this.dialog("LinksDialog");
    this.getView().setModel(new JSONModel({ transaction, links: transaction.Links, busy: false }), "links");
    this._linksDialog.open();
  }

  async onRemoveLink(ev: Button$PressEvent): Promise<void> {
    const link = ev.getSource().getBindingContext("links").getObject() as FiscalReconciliationLink;
    await this.runOnLinks(() => sendJson("POST", this.api.purchaseFiscalReconciliationRemove, { Key: link.Key }));
  }

  /** Abre o título firme do vínculo (spec 2026-10-13, títulos firmes). */
  onOpenFirmDocument(ev: Link$PressEvent): void {
    const link = ev.getSource().getBindingContext("links").getObject() as FiscalReconciliationLink;
    if (!link.FirmDocumentKey) return;

    this._linksDialog.close();
    this.navTo("financialDocumentsDetail", { id: link.FirmDocumentKey });
  }

  async onConfirmTransaction(): Promise<void> {
    const key = this.linksTransaction().Key;
    await this.runOnLinks(() => sendJson("POST", this.api.purchaseFiscalReconciliationConfirm, { TransactionKey: key }));
  }

  async onUnconfirmTransaction(): Promise<void> {
    const key = this.linksTransaction().Key;
    await this.runOnLinks(() => sendJson("POST", this.api.purchaseFiscalReconciliationUnconfirm, { TransactionKey: key }));
  }

  onCloseLinksDialog(): void {
    this._linksDialog.close();
  }

  private linksTransaction(): FiscalReconciliationTransaction {
    return (this.getModel("links") as JSONModel).getProperty("/transaction") as FiscalReconciliationTransaction;
  }

  /** Executa a ação, recarrega a tela e mostra o romaneio atualizado (ou fecha, se ele saiu do recorte). */
  private async runOnLinks(action: () => Promise<FetchResult>): Promise<void> {
    const model = this.getModel("links") as JSONModel;
    const key = this.linksTransaction().Key;

    model.setProperty("/busy", true);
    const result = await action();
    model.setProperty("/busy", false);
    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    await this.load();
    const all = (this.getModel("fiscal") as JSONModel).getProperty("/allTransactions") as FiscalReconciliationTransaction[];
    const fresh = all.find(t => t.Key === key);
    if (!fresh) {
      this._linksDialog.close();
      return;
    }
    model.setData({ transaction: fresh, links: fresh.Links, busy: false });
  }

  onExport(): void {
    const sheet = new Spreadsheet({
      // A data chega como string ISO; o Spreadsheet só preenche coluna Date a partir de um objeto Date.
      dataSource: ((this.getModel("fiscal") as JSONModel).getProperty("/transactions") as FiscalReconciliationTransaction[])
        .map(t => ({ ...t, TransactionDate: t.TransactionDate ? new Date(t.TransactionDate) : null })),
      fileName: "Conciliação Fiscal de Compras.xlsx",
      workbook: {
        columns: [
          { label: "Romaneio", property: "Code", type: EdmType.String },
          { label: "Data", property: "TransactionDate", type: EdmType.Date },
          { label: "Tipo", property: "TransactionTypeName", type: EdmType.String },
          { label: "Contrato", property: "ContractCodesText", type: EdmType.String },
          { label: "Placa", property: "TruckCode", type: EdmType.String },
          { label: "Físico (KG)", property: "PhysicalQuantity", type: EdmType.Number, scale: 3, delimiter: true },
          { label: "Fiscal (KG)", property: "FiscalQuantity", type: EdmType.Number, scale: 3, delimiter: true },
          { label: "Diferença (KG)", property: "Difference", type: EdmType.Number, scale: 3, delimiter: true },
          { label: "Situação", property: "StatusName", type: EdmType.String },
          { label: "NFs vinculadas", property: "InvoiceNumbersText", type: EdmType.String },
        ],
        context: { sheetName: "Conciliação" },
      },
    });
    void sheet.build().finally(() => sheet.destroy());
  }
}
