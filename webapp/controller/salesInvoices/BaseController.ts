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
import Sorter from "sap/ui/model/Sorter";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import CommonController from "siagrob1/controller/common/CommonController";
import { summarizeInvoiceTaxes, TaxLine } from "siagrob1/helpers/InvoiceTaxTotalsHelpers";
import { chargeLineOf, formatAmount, summarizeInvoiceCharges } from "siagrob1/helpers/InvoiceChargeTotalsHelpers";

export abstract class BaseController extends CommonController {

    private itemFiscalDialog: Dialog;

    private itemChangeLogsDialog: Dialog;

    private documentTotalAttached = false;

    /**
     * Filtro server-side das duas telas de conferência de entrega (Conferência e Estorno).
     * Mora aqui, e não em cada controller, pelo mesmo motivo do fragmento
     * `ReconciliationFilterbar` ser compartilhado: as duas telas são espelho, os campos são
     * os mesmos, e divergir seria bug. O que cada uma traz de próprio é o `scope`.
     *
     * O valor é escapado antes de entrar no literal — uma aspa simples no nome do cliente ou
     * da transportadora quebraria o $filter inteiro.
     *
     * Cliente, transportadora e produto casam contra código OU nome: o value help grava o
     * código, mas quem digita à mão digita o nome.
     */
    protected applyReconciliationFilters(tableId: string, scope: string): void {
      const oBinding = this.byId(tableId).getBinding("rows") as ODataListBinding;
      const filterData = (this.getModel("filter") as JSONModel).getData() as Record<string, string>;
      const filters: string[] = [scope];

      const esc = (value: string) => value.replace(/'/g, "''");

      Object.keys(filterData ?? {}).forEach((key) => {
        const value = filterData[key];
        if (!value) return;

        const v = esc(value);

        switch (key) {
          case "BranchCode":
            filters.push(`SalesInvoice/BranchCode eq '${v}'`);
            break;
          case "InvoiceNumber":
            filters.push(`contains(SalesInvoice/InvoiceNumber, '${v}')`);
            break;
          case "DateFrom":
            filters.push(`SalesInvoice/InvoiceDate ge ${v}`);
            break;
          case "DateTo":
            filters.push(`SalesInvoice/InvoiceDate le ${v}`);
            break;
          case "TaxDocumentNumber":
            filters.push(`contains(SalesInvoice/TaxDocumentNumber, '${v}')`);
            break;
          case "TruckCode":
            filters.push(`contains(SalesInvoice/TruckCode, '${v}')`);
            break;
          case "TruckingCompanyCode":
            filters.push(`(contains(SalesInvoice/TruckingCompanyCode, '${v}') or contains(SalesInvoice/TruckingCompanyName, '${v}'))`);
            break;
          case "CardCode":
            filters.push(`(contains(SalesInvoice/CardCode, '${v}') or contains(SalesInvoice/CardName, '${v}'))`);
            break;
          case "ContractCode":
            filters.push(`contains(SalesContract/Code, '${v}')`);
            break;
          case "ItemCode":
            filters.push(`(contains(ItemCode, '${v}') or contains(ItemName, '${v}'))`);
            break;
          default:
            filters.push(`contains(${key}, '${v}')`);
        }
      });

      oBinding.changeParameters({ $filter: filters.join(" and ") });
    }

    /**
     * Dados fiscais da linha num diálogo, e não em colunas do grid: são dezesseis campos
     * por item, e a tabela de itens ficaria com mais de vinte colunas roláveis.
     *
     * O diálogo é ligado ao contexto da LINHA selecionada — os campos usam caminho relativo
     * (`{Ncm}`, `{IcmsBase}`, ...) e escrevem direto no item.
     */
    /**
     * Pergunta ao servidor se a filial do documento calcula tributos (NF-e STANDALONE). A regra
     * mora no servidor (`TaxCalculationGate`); a tela só a consulta e trava os campos. Falha =
     * trava desligada: quem recalcula e sobrescreve continua sendo o servidor.
     */
    protected async refreshTaxLock(branchCode: string): Promise<boolean> {
      const uiModel = this.getModel("ui") as JSONModel;
      uiModel.setProperty("/taxLocked", false);

      if (!branchCode) {
        return false;
      }

      const locked = await this.isTaxCalculationActive(branchCode);
      uiModel.setProperty("/taxLocked", locked);
      return locked;
    }

    /** Mesma consulta, com a filial do documento ligado à view (Edit/Detail). */
    protected async refreshTaxLockFromContext() {
      // Zera antes de esperar a filial: um true velho não pode aparecer no documento de outra filial.
      (this.getModel("ui") as JSONModel).setProperty("/taxLocked", false);
      const oContext = this.getView().getBindingContext() as Context;
      const branchCode = oContext ? await oContext.requestProperty("BranchCode") as string : undefined;

      await this.refreshTaxLock(branchCode);
    }

    /** Modo (campos da NF-e) e nome da condição de pagamento do documento ligado à view. */
    protected async refreshNfeHeaderFromContext() {
      void this.refreshStandaloneFlag();
      const oContext = this.getView().getBindingContext() as Context;
      const code = oContext ? await oContext.requestProperty("PaymentConditionCode") as number : undefined;
      await this.refreshPaymentConditionName(code);
    }

    /** Devolução com NF-e própria (criada pelo Devolver): a grade trava produto, preço e natureza. */
    protected async refreshNfeReturnFromContext() {
      const uiModel = this.getModel("ui") as JSONModel;
      uiModel.setProperty("/nfeReturn", false);
      const oContext = this.getView().getBindingContext() as Context;
      const nfeReturn = oContext ? await oContext.requestProperty("IsNfeReturn") === true : false;
      uiModel.setProperty("/nfeReturn", nfeReturn);
    }

    async onOpenItemFiscal() {
      const oTable = this.byId("tableSalesInvoicesItems") as Table;
      const i = oTable.getSelectedIndex();

      if (i < 0) {
        MessageBox.alert("Selecione um item.");
        return;
      }

      const oItemContext = oTable.getContextByIndex(i) as Context;

      this.itemFiscalDialog ??= await DialogHelper.createDialog(
        this, "siagrob1.view.salesInvoices.fragments.ItemFiscalDialog", oItemContext);

      this.itemFiscalDialog.setBindingContext(oItemContext);
      this.itemFiscalDialog.open();
    }

    onCloseItemFiscal() {
      this.itemFiscalDialog?.close();
    }

    /**
     * Log de modificações da conferência de UMA linha, no diálogo compartilhado pelas duas
     * telas espelho (Conferência de entregas e Estorno).
     *
     * Recebe o contexto da linha do PRÓPRIO botão, e não a linha selecionada da tabela:
     * clicar no ícone não seleciona a linha, e pela seleção o diálogo mostraria o log de
     * outra linha (ou reclamaria de nenhuma seleção).
     *
     * O binding é feito aqui, e não no fragmento, porque o `$filter` depende da chave. Vai
     * como string inteira, o padrão do projeto para chave. `bindRows` a cada abertura, e não
     * refresh: o filtro muda de linha para linha, e reaproveitar o binding mostraria o log da
     * linha aberta antes.
     */
    protected async openItemChangeLogs(oContext: Context) {
      if (!oContext) {
        MessageBox.alert("Selecione uma linha.");
        return;
      }

      const key = oContext.getProperty("Key") as string;

      this.itemChangeLogsDialog ??= await DialogHelper.createDialog(
        this, "siagrob1.view.salesInvoices.fragments.SalesInvoiceItemChangeLogsDialog");

      // Pelo conteúdo do diálogo, e não por Fragment.byId: o DialogHelper prefixa os ids
      // com `viewId_nomeDoFragmento`, e reproduzir esse prefixo aqui quebraria calado se ele
      // mudasse lá.
      const oLogTable = this.itemChangeLogsDialog.getContent()[0] as Table;

      oLogTable.bindRows({
        path: "/SalesInvoicesChangeLogs",
        parameters: { $filter: `SalesInvoiceItemKey eq ${key}`, $$ownRequest: true },
        sorter: new Sorter("ChangedAt", true),
      });

      this.itemChangeLogsDialog.open();
    }

    onCloseItemChangeLogs() {
      this.itemChangeLogsDialog?.close();
    }

    /**
     * Total geral do documento (itens + frete + seguro + outras despesas − desconto, spec 2026-10-05 D2), somado NO
     * CLIENTE, e a seção "Totais" do Detail (`/chargeTotals`).
     *
     * `GrandTotal` é [NotMapped]: só existe depois que o servidor responde, então num documento em digitação não haveria
     * total nenhum. Aqui a soma acompanha a grade.
     *
     * Percorre `getAllCurrentContexts()` e não as linhas visíveis: a sap.ui.table é virtualizada, e somar o que está na
     * tela daria um total menor conforme a rolagem.
     *
     * Recalcula também o quadro "Tributos" do Detail (`/taxTotals`), que soma as mesmas linhas.
     */
    protected refreshDocumentTotal() {
      const oTable = this.byId("tableSalesInvoicesItems") as Table;
      const oBinding = oTable?.getBinding("rows") as ODataListBinding;
      const uiModel = this.getModel("ui") as JSONModel;

      if (!oBinding || !uiModel) {
        return;
      }

      const contexts = oBinding.getAllCurrentContexts();
      const charges = summarizeInvoiceCharges(contexts.map((ctx) => chargeLineOf(ctx)));

      uiModel.setProperty("/documentTotal", formatAmount(charges.grandTotal));
      uiModel.setProperty("/chargeTotals", charges);
      uiModel.setProperty("/taxTotals", summarizeInvoiceTaxes(contexts.map((ctx) => ctx.getObject() as TaxLine)));
    }

    /** Quantidade, preço ou um dos quatro valores da linha mudou: o total geral acompanha. */
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

      const outgoingOnly = await this.outgoingUsagesFilter();

      const oSelected = await DialogHelper.openTableSelectDialog(
        this, "UsagesSelectDialog", ["Name", "Description"],
        [ new Filter("Inactive", FilterOperator.EQ, false) ], undefined, outgoingOnly);

      // Cancelar resolve undefined: não mexer no que já estava preenchido.
      if (!oSelected) {
        return;
      }

      oInput.setValue(oSelected.getProperty("Name") as string);
      await oTarget.setProperty("UsageCode", oSelected.getProperty("Code"));

      await this.previewCfop(oTarget, oSelected.getProperty("Code") as number);
    }

    /**
     * Em STANDALONE o documento de saída só aceita natureza de Saída. O enum vai por $filter
     * estático (o Filter do UI5 não formata enum). Teste POSITIVO do modo, como no servidor: em
     * SAPB1 (o OUSG não tem tipo, Direction vem nulo) ou se a consulta falhar, nenhum filtro —
     * filtrar ali esconderia todas as naturezas.
     */
    private async outgoingUsagesFilter(): Promise<string> {
      try {
        const erp = (await this.getSystemInfo())?.erp;
        return erp?.toUpperCase() === "STANDALONE" ? "Direction eq 'Outgoing'" : undefined;
      } catch {
        return undefined;
      }
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
        label: "Tipo",
        property: "InvoiceType",
        type: EdmType.Enumeration,
        valueMap: {
          "Normal": "Normal",
          "Return": "Retorno",
        }
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
        // "Retornado" É atribuído no documento de SAÍDA (diferente da entrada, onde o valor
        // existe no enum compartilhado mas nenhum serviço o usa). Sem ele no mapa, todo
        // documento retornado saía com a coluna Situação EM BRANCO na planilha.
        valueMap: {
          "Pending": "Pendente",
          "Confirmed": "Confirmado",
          "Cancelled": "Cancelado",
          "Returned": "Retornado",
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
        label: "Sem Nota Fiscal",
        property: "WithoutTaxDocument",
        type: EdmType.Boolean,
        trueValue: "Sim",
        falseValue: "Não",
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
      // A planilha segue a ordem em que o usuário deixou as colunas na tela (GAC-1163).
      const cols = this.orderExportColumns(table, this.createColumnConfig());
      
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
