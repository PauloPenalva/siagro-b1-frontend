import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { RowActionItem$PressEvent } from "sap/ui/table/RowActionItem";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { SortOrder } from "sap/ui/core/library";
import { anyOfFilter } from "siagrob1/helpers/FilterHelpers";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import CommonController from "../common/CommonController";
import { mapPaymentReleaseExportRow, PAYMENT_RELEASE_EXPORT_DEPARTMENTS } from "siagrob1/helpers/PaymentReleaseExportHelpers";

type FilterData = {
  PaymentReleaseStatus?: string[],
  CardCode?: string,
  CreationDateFrom?: string,
  CreationDateTo?: string,
}

/**
 * Lista de Liberação de Pagamento (GAC-1188): um contrato de compra por linha, com Sim/Não por
 * departamento.
 *
 * @namespace siagrob1.controller.paymentReleases
 */
export default class Main extends CommonController {

  formatter = formatter;

  /** `$filter` corrente da filterbar, reaproveitado pelo binding do export. */
  private currentFilter: string;

  onInit(): void {
    this.createFilterModel({ PaymentReleaseStatus: [] });

    this.getRouter().getRoute("paymentReleases")
      .attachPatternMatched(() => this.applyFilters());
  }

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  onSearch(): void {
    this.applyFilters();
  }

  private applyFilters() {
    const oBinding = this.getView().byId("tablePaymentReleases").getBinding("rows") as ODataListBinding;
    const filterData = (this.getModel("filter") as JSONModel).getData() as FilterData;
    const filters: string[] = [];

    const statuses = filterData.PaymentReleaseStatus ?? [];
    if (statuses.length > 0) {
      // O backend grava "sem status" como nulo ou Pending; os dois valem "Pendente" na tela.
      const others = statuses.filter((s) => s !== "Pending");
      const parts: string[] = [];
      if (statuses.includes("Pending")) {
        parts.push("PaymentReleaseStatus eq null", "PaymentReleaseStatus eq 'Pending'");
      }
      const rest = anyOfFilter("PaymentReleaseStatus", others);
      if (rest) parts.push(rest);
      filters.push(parts.length > 1 ? `(${parts.join(" or ")})` : parts[0]);
    }

    if (filterData.CardCode) filters.push(`contains(CardCode,'${filterData.CardCode.replace(/'/g, "''")}')`);
    if (filterData.CreationDateFrom) filters.push(`CreationDate ge ${filterData.CreationDateFrom}`);
    if (filterData.CreationDateTo) filters.push(`CreationDate le ${filterData.CreationDateTo}`);

    const filterParam = filters.length > 0 ? filters.join(" and ") : undefined;

    this.currentFilter = filterParam;

    oBinding.changeParameters({ $filter: filterParam });
  }

  onRowNavigate(ev: RowActionItem$PressEvent): void {
    const ctx = ev.getParameter("row").getBindingContext() as Context;
    this.navTo("purchaseContractsDetail", { id: ctx.getProperty("Key") as string });
  }

  onDetail(): void {
    const oTable = this.byId("tablePaymentReleases") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    this.navTo("purchaseContractsDetail", { id: oTable.getContextByIndex(i).getProperty("Key") as string });
  }

  private createColumnConfig(): Column[] {
    return [
      { label: "Contrato", property: "Code", type: EdmType.String },
      { label: "Emissão", property: "CreationDate", type: EdmType.Date },
      { label: "Cod.Fornecedor", property: "CardCode", type: EdmType.String },
      { label: "Fornecedor", property: "CardName", type: EdmType.String },
      { label: "Cond. Pagto.", property: "PaymentTerms", type: EdmType.String },
      {
        label: "Status Financeiro",
        property: "PaymentReleaseStatus",
        type: EdmType.Enumeration,
        valueMap: {
          "Pending": "Pendente",
          "UnderReview": "Em análise",
          "IncompleteDocuments": "Documentação incompleta",
          "Approved": "Aprovado",
          "PreApproved": "Pré-aprovado",
        },
      },
      {
        label: "Antecipação Liberada pela Diretoria",
        property: "EarlyPaymentAuthorized",
        type: EdmType.Boolean,
        trueValue: "Sim",
        falseValue: "Não",
      },
      ...PAYMENT_RELEASE_EXPORT_DEPARTMENTS.map(([, property, label]): Column => (
        { label, property, type: EdmType.String })),
    ];
  }

  /**
   * Lê os contratos com PaymentReleases expandido (o createExportBinding não expande coleção) e
   * devolve as linhas já achatadas, na ordem e com o filtro da tela.
   */
  private async loadExportRows(cols: Column[], orderby: string): Promise<Record<string, unknown>[]> {
    const select = new Set<string>(["Key", "IsBarter"]);
    cols.forEach((c) => {
      if (!PAYMENT_RELEASE_EXPORT_DEPARTMENTS.some(([, property]) => property === c.property)) {
        select.add(c.property as string);
      }
    });

    const parameters: Record<string, string> = {
      $orderby: orderby,
      $select: [...select].join(","),
      $expand: "PaymentReleases($select=Department,Released)",
    };
    if (this.currentFilter) parameters.$filter = this.currentFilter;

    const binding = (this.getModel() as ODataModel).bindList("/PurchaseContracts", undefined, undefined, undefined, parameters);
    try {
      const contexts = await binding.requestContexts(0, Number.MAX_SAFE_INTEGER);
      return contexts.map((ctx) => mapPaymentReleaseExportRow(ctx.getObject() as Record<string, unknown>));
    } finally {
      binding.destroy();
    }
  }

  private getExportOrderBy(oTable: Table): string {
    const aOrder = oTable.getSortedColumns()
      .filter((oColumn) => oColumn.getSortOrder() !== SortOrder.None && oColumn.getSortProperty())
      .map((oColumn) => oColumn.getSortProperty()
        + (oColumn.getSortOrder() === SortOrder.Descending ? " desc" : ""));

    return aOrder.length > 0 ? aOrder.join(",") : "RowId desc";
  }

  async onExcel() {
    const oTable = this.byId("tablePaymentReleases") as Table;
    const cols = this.orderExportColumns(oTable, this.createColumnConfig());

    const setting: SpreadsheetSettings = {
      dataSource: await this.loadExportRows(cols, this.getExportOrderBy(oTable)),
      fileName: "Liberação de Pagamento.xlsx",
      workbook: {
        columns: cols,
        context: { sheetName: "Liberação de Pagamento" },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () {
      oSheet.destroy();
    });
  }
}
