import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import CommonController from "siagrob1/controller/common/CommonController";

export abstract class BaseController extends CommonController {

    private itemFiscalDialog: Dialog;

    private documentTotalAttached = false;

    /**
     * Dados fiscais da linha num diálogo, e não em colunas do grid: são dezesseis campos
     * por item, e a tabela de itens ficaria com mais de vinte colunas roláveis.
     *
     * O diálogo é ligado ao contexto da LINHA selecionada — os campos usam caminho relativo
     * (`{Ncm}`, `{IcmsBase}`, ...) e escrevem direto no item.
     */
    async onOpenItemFiscal() {
      const oTable = this.byId("tableSalesInvoicesItems") as Table;
      const i = oTable.getSelectedIndex();

      if (i < 0) {
        MessageBox.alert("Selecione um item.");
        return;
      }

      this.itemFiscalDialog ??= await DialogHelper.createDialog(
        this, "siagrob1.view.salesInvoices.fragments.ItemFiscalDialog");

      this.itemFiscalDialog.setBindingContext(oTable.getContextByIndex(i) as Context);
      this.itemFiscalDialog.open();
    }

    onCloseItemFiscal() {
      this.itemFiscalDialog?.close();
    }

    /**
     * Total geral do documento, somado NO CLIENTE.
     *
     * `TotalInvoiceItems` é [NotMapped]: só existe depois que o servidor responde, então num
     * documento em digitação não haveria total nenhum. Aqui a soma acompanha a grade.
     *
     * Percorre `getAllCurrentContexts()` e não as linhas visíveis: a sap.ui.table é
     * virtualizada, e somar o que está na tela daria um total menor conforme a rolagem.
     */
    protected refreshDocumentTotal() {
      const oTable = this.byId("tableSalesInvoicesItems") as Table;
      const oBinding = oTable?.getBinding("rows") as ODataListBinding;
      const uiModel = this.getModel("ui") as JSONModel;

      if (!oBinding || !uiModel) {
        return;
      }

      const total = oBinding.getAllCurrentContexts().reduce((sum, ctx) => {
        const quantity = Number(ctx.getProperty("Quantity") ?? 0);
        const unitPrice = Number(ctx.getProperty("UnitPrice") ?? 0);

        return sum + (isNaN(quantity) ? 0 : quantity) * (isNaN(unitPrice) ? 0 : unitPrice);
      }, 0);

      uiModel.setProperty("/documentTotal", total.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }));
    }

    /** Quantidade ou preço mudou numa linha: o total geral acompanha. */
    onItemAmountChange() {
      this.refreshDocumentTotal();
    }

    /**
     * Recalcula o total quando a grade recebe dados — é o que faz o número aparecer nas telas
     * de edição e visualização, onde os itens chegam do servidor e não da digitação.
     * Idempotente: navegar de novo não empilha listeners.
     */
    protected attachDocumentTotalRefresh() {
      if (this.documentTotalAttached) {
        return;
      }

      const oTable = this.byId("tableSalesInvoicesItems") as Table;
      const oBinding = oTable?.getBinding("rows") as ODataListBinding;

      if (!oBinding) {
        return;
      }

      oBinding.attachChange(() => this.refreshDocumentTotal());
      this.documentTotalAttached = true;
    }

    /**
     * Value help da natureza de operação da LINHA.
     *
     * Não usa o `applyValueHelp` genérico porque são dois valores: o Input mostra o nome
     * (`UsageName`, desnormalizado na linha) e quem vale para o servidor é o `UsageCode`.
     * O helper genérico grava a descrição com group id `null` — certo para descrição vinda
     * do servidor, errado para a CHAVE, que precisa entrar no batch.
     */
    async openUsageValueHelp(ev: Input$ValueHelpRequestEvent) {
      const oInput = ev.getSource();
      const oTarget = oInput.getBindingContext() as Context;

      const oSelected = await DialogHelper.openTableSelectDialog(
        this, "UsagesSelectDialog", ["Name", "Description"],
        [ new Filter("Inactive", FilterOperator.EQ, false) ]);

      // Cancelar resolve undefined: não mexer no que já estava preenchido.
      if (!oSelected) {
        return;
      }

      oInput.setValue(oSelected.getProperty("Name") as string);
      await oTarget.setProperty("UsageCode", oSelected.getProperty("Code"));

      await this.previewCfop(oTarget, oSelected.getProperty("Code") as number);
    }

    /**
     * Mostra o CFOP assim que a natureza é escolhida.
     *
     * Só antecipação: quem grava e congela é o servidor, com a mesma regra. Sem isto o campo
     * ficava vazio durante a digitação, porque o valor só passava a existir depois de salvar.
     *
     * Falha silenciosa de propósito — filial ou UF ainda não preenchidas são um estado normal
     * no meio do preenchimento, e a recusa de verdade vem na gravação, com mensagem.
     */
    private async previewCfop(oItem: Context, usageCode: number) {
      const oInvoice = this.getView().getBindingContext() as Context;

      const branchCode = oInvoice?.getProperty("BranchCode") as string;
      const cardCode = oInvoice?.getProperty("CardCode") as string;

      if (!branchCode || !cardCode) {
        return;
      }

      try {
        const oModel = this.getView().getModel() as ODataModel;

        // Função OData v4 se liga com `(...)` e recebe os parâmetros por setParameter —
        // embutir os valores na URL não é invocação, é caminho de entidade, e o modelo
        // recusa.
        const oFunction = oModel.bindContext("/SalesInvoicesResolveCfop(...)");
        oFunction.setParameter("UsageCode", usageCode);
        oFunction.setParameter("BranchCode", branchCode);
        oFunction.setParameter("CardCode", cardCode);

        await oFunction.invoke();

        const cfop = oFunction.getBoundContext()?.getProperty("value") as string;

        if (cfop) {
          await oItem.setProperty("Cfop", cfop);
        }
      } catch {
        // Sem CFOP resolvível ainda: a gravação dirá o porquê.
      }
    }


    private createColumnConfig() {
      const aCols: Column[] = [];

      aCols.push({
        label: "Filial",
        property: "Branch/ShortName",
        type: EdmType.String,
      });

      aCols.push({
        label: "Numero",
        property: "InvoiceNumber",
        type: EdmType.String,
      });
      
      aCols.push({
        label: "Emissão",
        property: "InvoiceDate",
        type: EdmType.Date,
      });
      
      aCols.push({
        label: "Status",
        property: "InvoiceStatus",
        type: EdmType.Enumeration,
        valueMap: {
          "Pending": "Pendente",
          "Confirmed": "Confirmado",
          "Cancelled": "Cancelado",
        }
      });

      aCols.push({
        label: "Cod.Cliente",
        property: "CardCode",
        type: EdmType.String,
      });

      aCols.push({
        label: "Cliente",
        property: "CardName",
        type: EdmType.String,
      });
      
      aCols.push({
        label: "Valor Produtos",
        property: "TotalInvoiceItems",
        type: EdmType.Number,
        scale: 2,
        delimiter: true
      });

      aCols.push({
        label: "Placa",
        property: "TruckCode",
        type: EdmType.String
      });

      aCols.push({
        label: "Peso Bruto",
        property: "GrossWeight",
        type: EdmType.Number,
        scale: 3,
        delimiter: true,
      });


      aCols.push({
        label: "Nota Fiscal",
        property: "TaxDocumentNumber",
        type: EdmType.String,
      });

      aCols.push({
        label: "Série",
        property: "TaxDocumentSeries",
        type: EdmType.String,
      });

      aCols.push({
        label: "Chave NF-e",
        property: "ChaveNFe",
        type: EdmType.String,
      });

      aCols.push({
        label: "Observações",
        property: "Comments",
        type: EdmType.String,
      });

      return aCols;
    }
      
    onExcel() {
      const table = this.byId("tableSalesInvoices") as Table;
      const binding = table.getBinding("rows") as ODataListBinding
      const cols = this.createColumnConfig();
      
      const setting: SpreadsheetSettings = {
        dataSource: binding,
        fileName: 'Documentos de saida.xlsx',
        workbook: {
          columns: cols,
          hierarchyLevel: "Level",
          context: {
            sheetName: 'Documentos de saída'
          }
        }
      };
  
      const oSheet = new Spreadsheet(setting);
      void oSheet.build().finally(function() {
        oSheet.destroy();
      });
    }
    
}
