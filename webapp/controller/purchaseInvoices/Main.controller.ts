import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/**
 * Lista dos documentos de entrada — NF de fornecedor, venda futura do produtor e suas remessas,
 * insumo, serviço, e a devolução emitida pelo cliente.
 *
 * @namespace siagrob1.controller.purchaseInvoices
 */
export default class Main extends BaseController {
  formatter = { ...formatter }

  onInit(): void {
    this.createFilterModel();

    this.getRouter().getRoute("purchaseInvoices")
      .attachPatternMatched(() => this.applyFilters());
  }

  onRefresh(): void {
    (this.byId("purchaseInvoicesTable").getBinding("rows") as ODataListBinding)?.refresh();
  }

  /** Evento `search` da FilterBar — não recebe argumento, ao contrário do SearchField. */
  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.clearFilters();
    this.applyFilters();
  }

  /**
   * Monta o `$filter` a partir do modelo `filter` e o aplica como parâmetro ESTÁTICO do binding,
   * no mesmo molde da lista de documentos de saída.
   *
   * Os três enums (`InvoiceType`, `IssuerType`, `InvoiceStatus`) entram como `eq 'valor'` em
   * string crua de propósito. `sap.ui.model.Filter` faria o UI5 montar o literal a partir do
   * metadata, e ele não sabe formatar enum: estoura
   * "Unsupported type: SIAGROB1.PurchaseInvoiceType" num diálogo, com a lista sem filtrar nada.
   */
  private applyFilters(): void {
    const oBinding = this.byId("purchaseInvoicesTable")
      .getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = (filterModel?.getData() ?? {}) as Record<string, string>;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      const value = filterData[key];

      if (!value) return;

      if (key === "InvoiceType" || key === "IssuerType" || key === "InvoiceStatus") {
        filters.push(`${key} eq '${value}'`);
      } else if (key === "DateFrom") {
        filters.push(`IssueDate ge ${value}`);
      } else if (key === "DateTo") {
        filters.push(`IssueDate le ${value}`);
      } else {
        filters.push(`contains(${key},'${value}')`);
      }
    });

    // `undefined` REMOVE o parâmetro — é assim que a barra limpa volta a trazer tudo.
    oBinding.changeParameters({
      $filter: filters.length > 0 ? filters.join(" and ") : undefined,
    });
  }

  onCreate() {
    this.navTo("purchaseInvoicesAdd");
  }

  onDetail() {
    const oContext = this.selectedContext();

    if (!oContext) {
      return;
    }

    this.navTo("purchaseInvoicesDetail", { id: oContext.getProperty("Key") as string });
  }

  onEdit() {
    const oContext = this.selectedContext();

    if (!oContext) {
      return;
    }

    if (oContext.getProperty("InvoiceStatus") !== "Pending") {
      MessageBox.warning(
        "Somente documento pendente pode ser alterado. Estorne a confirmação antes.");
      return;
    }

    this.navTo("purchaseInvoicesEdit", { id: oContext.getProperty("Key") as string });
  }

  /**
   * Cancelar não estorna nada nesta fase: o documento nunca moveu saldo. Tira o registro da
   * conciliação e LIBERA a chave de NF-e para relançamento, sem apagar o documento.
   */
  async onCancelInvoice() {
    const oContext = this.selectedContext();

    if (!oContext) {
      return;
    }

    if (!await confirmDialog(
      "Cancelar este documento ? A chave da NF-e volta a ficar livre.",
      "Cancelar documento ?")) {
      return;
    }

    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);

      const action = oModel.bindContext("/PurchaseInvoicesCancel(...)");
      action.setParameter("Key", oContext.getProperty("Key"));

      await action.invoke();

      MessageToast.show("Documento cancelado.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  private selectedContext(): Context | null {
    const oTable = this.byId("purchaseInvoicesTable") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um documento.");
      return null;
    }

    return oTable.getContextByIndex(i) as Context;
  }

  /* ------------------------------------------------------------------ */
  /* Exportar Excel                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Colunas do arquivo, espelhando as da tabela.
   *
   * Os enums saem pelo `valueMap` com os mesmos rótulos pt-BR que os formatters produzem na tela:
   * exportar `Return` ou `ThirdParty` cru deixaria a planilha ilegível para quem a recebe.
   */
  private createColumnConfig(): Column[] {
    const aCols: Column[] = [];

    aCols.push({ label: "Emitente", property: "CardName", type: EdmType.String });
    aCols.push({ label: "Cod.Emitente", property: "CardCode", type: EdmType.String });

    aCols.push({
      label: "Tipo",
      property: "InvoiceType",
      type: EdmType.Enumeration,
      valueMap: {
        "Normal": "Normal",
        "Return": "Devolução",
      },
    });

    aCols.push({
      label: "Emissão própria",
      property: "IssuerType",
      type: EdmType.Enumeration,
      valueMap: {
        "ThirdParty": "De terceiro",
        "Own": "Própria",
      },
    });

    aCols.push({
      label: "Situação",
      property: "InvoiceStatus",
      type: EdmType.Enumeration,
      valueMap: {
        "Pending": "Pendente",
        "Confirmed": "Confirmado",
        "Cancelled": "Cancelado",
      },
    });

    aCols.push({ label: "Número interno", property: "InvoiceNumber", type: EdmType.String });
    aCols.push({ label: "NF", property: "TaxDocumentNumber", type: EdmType.String });
    aCols.push({ label: "Série", property: "TaxDocumentSeries", type: EdmType.String });
    aCols.push({ label: "Emissão", property: "IssueDate", type: EdmType.Date });
    aCols.push({ label: "Entrada", property: "PostingDate", type: EdmType.Date });

    aCols.push({
      label: "Valor declarado",
      property: "TotalDocumentValue",
      type: EdmType.Number,
      scale: 2,
      delimiter: true,
    });

    aCols.push({ label: "Chave NF-e", property: "ChaveNFe", type: EdmType.String });

    return aCols;
  }

  onExcel(): void {
    const table = this.byId("purchaseInvoicesTable") as Table;
    const binding = table.getBinding("rows") as ODataListBinding;

    const setting: SpreadsheetSettings = {
      dataSource: binding,
      fileName: "Documentos de entrada.xlsx",
      workbook: {
        columns: this.createColumnConfig(),
        hierarchyLevel: "Level",
        context: {
          sheetName: "Documentos de entrada",
        },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () {
      oSheet.destroy();
    });
  }
}
