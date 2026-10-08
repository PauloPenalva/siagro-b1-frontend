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
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { sendJson, odataValue } from "siagrob1/helpers/FetchHelpers";
import { canCancelNfe, canVoidNfeNumber, nfeOutcomeMessage, NfeOutcome } from "siagrob1/helpers/NfeHelpers";
import { openNfeCancelDialog } from "siagrob1/dialogs/NfeCancelDialog";
import { runNfeVoidNumber } from "siagrob1/dialogs/NfeVoidNumberAction";
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
      .attachPatternMatched(() => {
        void this.refreshStandaloneFlag().then(() => this.refreshAnyBranchIssuesNfe());
        this.applyFilters();
      });
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

      if (key === "InvoiceType" || key === "IssuerType" || key === "InvoiceStatus" || key === "NfeStatus") {
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

    if (oContext.getProperty("NfeStatus") === "Processing") {
      MessageBox.warning("A NF-e deste documento está em processamento na SEFAZ: aguarde e use Consultar situação.");
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

    // NF-e própria autorizada: o cancelamento vai pela SEFAZ, com justificativa.
    if (canCancelNfe(oContext.getProperty("NfeStatus") as string, oContext.getProperty("InvoiceStatus") as string)) {
      const justification = await openNfeCancelDialog(this.getView());
      if (justification === null) {
        return;
      }

      this.setBusy(true);
      try {
        const result = await sendJson("POST", ServerRoutes.purchaseInvoicesCancelNfe,
          { Key: oContext.getProperty("Key") as string, Justification: justification });

        if (!result.ok) {
          MessageBox.error(result.message);
          return;
        }

        const message = nfeOutcomeMessage(odataValue<NfeOutcome>(result.data));
        if (message.type === "success") {
          MessageToast.show(message.text);
        } else {
          MessageBox.warning(message.text);
        }
      } finally {
        this.onRefresh();
        this.setBusy(false);
      }
      return;
    }

    if (!await confirmDialog(
      "Cancelar este documento ? A chave da NF-e de terceiro volta a ficar livre.",
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

  /** Inutiliza a numeração da NF-e própria rejeitada de um documento cancelado. */
  async onVoidNfeNumber() {
    const ctx = this.selectedContext();
    if (!ctx) {
      return;
    }

    if (!canVoidNfeNumber(ctx.getProperty("NfeStatus") as string, ctx.getProperty("InvoiceStatus") as string,
      ctx.getProperty("IssuerType") as string)) {
      MessageBox.warning("Só o documento cancelado com NF-e própria rejeitada tem a numeração inutilizada.");
      return;
    }

    if (await runNfeVoidNumber(this.getView(), ServerRoutes.purchaseInvoicesVoidNfeNumber,
      ctx.getProperty("Key") as string, (busy) => this.setBusy(busy))) {
      this.onRefresh();
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

    aCols.push({
      label: "Total geral",
      property: "GrandTotal",
      type: EdmType.Number,
      scale: 2,
      delimiter: true,
    });

    aCols.push({
      label: "Situação NF-e",
      property: "NfeStatus",
      type: EdmType.Enumeration,
      valueMap: {
        "None": "", "Processing": "Em processamento", "Authorized": "Autorizada",
        "Rejected": "Rejeitada", "Denied": "Denegada", "Cancelled": "Cancelada", "Voided": "Inutilizada",
      },
    });

    aCols.push({ label: "Cancelada em", property: "NfeCancelledAt", type: EdmType.DateTime });

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
        // A planilha segue a ordem em que o usuário deixou as colunas na tela (GAC-1163).
        columns: this.orderExportColumns(table, this.createColumnConfig()),
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
