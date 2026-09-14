import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Sorter from "sap/ui/model/Sorter";
import Table from "sap/ui/table/Table";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export default class Main extends BaseController {

  /** `$filter` corrente da filterbar, reaproveitado pelo binding do export. */
  private currentFilter: string;

  private reasonsLoaded = false;

  onInit(): void {
    this.createFilterModel();
    this.getView().setModel(new JSONModel([]), "reasons");

    this.getRouter().getRoute("warehouseReconciliations")
      .attachPatternMatched(() => {
        if (!this.reasonsLoaded) {
          this.reasonsLoaded = true;
          void this.loadReasons();
        }
        this.applyFilters();
      });
  }

  /**
   * Motivo do filtro: JSONModel carregado uma vez, não bind direto em
   * `/WarehouseReconciliationReasons` com `suspended: true` — mesmo motivo do Filial em
   * shipmentLoads (a FilterBar tenta resumir o binding suspenso toda vez que reaparece, mas nunca
   * o suspende de novo, e estoura "Cannot resume a not suspended binding" na segunda exibição; um
   * JSONModel não tem suspend/resume, então o bug nem existe pra esse tipo de binding).
   *
   * Inclui motivos INATIVOS de propósito (sem `$filter: 'Active eq true'`, diferente do Select do
   * formulário): o filtro é histórico e precisa continuar encontrando conferências antigas cujo
   * motivo foi desativado depois. "Todos" é um item sintético prependado aos dados, não um segundo
   * child XML — a aggregation binding do Select só suporta UM child como template.
   */
  private async loadReasons(): Promise<void> {
    const contexts = await (this.getModel() as ODataModel)
      .bindList("/WarehouseReconciliationReasons", undefined, [new Sorter("Description")])
      .requestContexts(0, 1000);

    const reasons = contexts.map((ctx) => ctx.getObject() as { Key: string; Description: string });
    (this.getModel("reasons") as JSONModel).setData([{ Key: "", Description: "Todos" }, ...reasons]);
  }

  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.clearFilters();
    this.applyFilters();
  }

  private applyFilters(): void {
    const binding = this.byId("warehouseReconciliationsTable").getBinding("rows") as ODataListBinding;
    const data = ((this.getModel("filter") as JSONModel).getData() ?? {}) as Record<string, string>;
    const filters: string[] = [];
    const quote = (v: string) => v.replace(/'/g, "''");

    Object.keys(data).forEach((key) => {
      const value = data[key];
      if (!value) return;

      switch (key) {
        // Enum: $filter estático com o nome do membro (Filter do UI5 sobre enum estoura).
        case "Status": filters.push(`Status eq '${quote(value)}'`); break;
        case "DateFrom": filters.push(`ReferenceDate ge ${value}T00:00:00Z`); break;
        case "DateTo": filters.push(`ReferenceDate lt ${value}T23:59:59Z`); break;
        // Guid: literal sem aspas.
        case "ReasonKey": filters.push(`ReasonKey eq ${value}`); break;
        default: filters.push(`contains(${key},'${quote(value)}')`);
      }
    });

    this.currentFilter = filters.length ? filters.join(" and ") : undefined;
    binding.changeParameters({ $filter: this.currentFilter });
    binding.refresh();
  }

  onCreate(): void {
    this.navTo("warehouseReconciliationsNew");
  }

  onDetail(): void {
    const table = this.byId("warehouseReconciliationsTable") as Table;
    const i = table.getSelectedIndex();
    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }
    this.navTo("warehouseReconciliationsDetail", { id: table.getContextByIndex(i).getProperty("Key") as string });
  }

  private createColumnConfig(): Column[] {
    const number = (label: string, property: string): Column =>
      ({ label, property, type: EdmType.Number, scale: 3, delimiter: true });

    return [
      {
        label: "Status", property: "Status", type: EdmType.Enumeration,
        valueMap: { Draft: "Rascunho", InApproval: "Em aprovação", Approved: "Aprovada", Rejected: "Rejeitada", Cancelled: "Cancelada" },
      },
      { label: "Número", property: "Code", type: EdmType.String },
      { label: "Referência", property: "ReferenceDate", type: EdmType.Date },
      { label: "Cod.Armazém", property: "WarehouseCode", type: EdmType.String },
      { label: "Armazém", property: "WarehouseName", type: EdmType.String },
      { label: "Cod.Produto", property: "ItemCode", type: EdmType.String },
      { label: "Produto", property: "ItemName", type: EdmType.String },
      number("Saldo Informado", "ReportedBalance"),
      number("Saldo Sistema", "SystemBalance"),
      number("Diferença", "Difference"),
      { label: "Un.Med.", property: "UnitOfMeasureCode", type: EdmType.String },
      { label: "Motivo", property: "Reason/Description", type: EdmType.String },
      { label: "Criado por", property: "CreatedBy", type: EdmType.String },
      { label: "Aprovado por", property: "ApprovedBy", type: EdmType.String },
    ];
  }

  async onExcel(): Promise<void> {
    const table = this.byId("warehouseReconciliationsTable") as Table;
    const cols = this.orderExportColumns(table, this.createColumnConfig());

    // Binding próprio para o export: o da tabela usa autoExpandSelect e seu `$select` não inclui
    // `ApprovedBy` (nenhum controle da tela está ligado a ele), então "Aprovado por" saía sempre
    // vazio na planilha.
    const settings: SpreadsheetSettings = {
      dataSource: await this.createExportBinding("/WarehouseReconciliations", cols, "RowId desc", this.currentFilter),
      fileName: "Conferências de Saldo de Armazém.xlsx",
      workbook: {
        columns: cols,
        context: { sheetName: "Conferências" },
      },
    };

    const sheet = new Spreadsheet(settings);
    void sheet.build().finally(() => sheet.destroy());
  }
}
