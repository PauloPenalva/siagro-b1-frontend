
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import MessageToast from "sap/m/MessageToast";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import Dialog from "sap/m/Dialog";
import { Input$LiveChangeEvent } from "sap/m/Input";

const NFE_KEY_LENGTH = 44;


/**
 * @namespace siagrob1.controller.salesInvoices
 */
export default class Main extends BaseController {

  formatter = formatter;

  private _notaFiscalDialog: Dialog;

	onInit(): void  {
    this.createFilterModel();

    this.getRouter().getRoute("salesInvoices")
      .attachPatternMatched(() => this.applyFilters());
	}

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

	onSearch(): void {
    this.applyFilters()
	}

  private applyFilters() {
    const oBinding = this.getView().byId("tableSalesInvoices").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as Record<string, string>;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      const filterKey = key;
      const value = filterData[filterKey];

      if (!value) return;

      if (filterKey == "InvoiceStatus" ) {
        filters.push(`${filterKey} eq '${value}'`)
      } else if (filterKey == "DateFrom") {
        filters.push(`InvoiceDate ge ${value}`)
      } else if (filterKey == "DateTo") {
        filters.push(`InvoiceDate le ${value}`)
      } else if (filterKey == "WithoutTaxDocument") {
        // Checkbox: só entra quando marcado (desmarcado é `false`, já descartado acima).
        // O `eq ''` cobre documentos antigos, gravados antes de o serviço normalizar
        // branco para null.
        filters.push(`(TaxDocumentNumber eq null or TaxDocumentNumber eq '')`)
      } else {
        filters.push(`contains(${filterKey},'${value}')`)
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

		oBinding.changeParameters({
      $filter: filterParam
    });
  }

  /**
   * Documento de saída AVULSO — sem romaneio. O faturamento de romaneio continua entrando
   * pela tela de Expedição.
   */
  onCreate(): void {
    this.navTo("salesInvoicesAdd");
  }

 	onDetail(): void {
		const oTable = this.byId("tableSalesInvoices") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Key") as string;
    
		this.navTo("salesInvoicesDetail", {id: sId});
	}

  private refreshData() {
    const oTable = this.byId("tableSalesInvoices") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 
  async onCancel() {
    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();
    if (selectedInvoice.length == 0){
      MessageBox.warning("Selecione um registro.")
      throw new Error("Selecione um registro");
    }

    if (selectedInvoice.length > 1){
      MessageBox.warning("Selecione apenas um registro.")
      throw new Error("Selecione apenas um registro.");
    }

    if (await DialogHelper.confirmDialog("Cancelar Documento de Saída ?")) {
      const ctx = table.getContextByIndex(selectedInvoice[0]);
      const oModel = this.getModel() as ODataModel;
      const action = oModel.bindContext("/SalesInvoicesCancel(...)");
      action.setParameter("Key", ctx.getProperty("Key"));
      
      this.setBusy(true);
      void action.invoke()
        .then(() => {
          this.refreshData();
          MessageToast.show("Documento de saída cancelado com sucesso.")
        })
        .finally(() => this.setBusy(false));
    }
  }

  async onNotaFiscal() {
    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();
    if (selectedInvoice.length == 0){
      MessageBox.warning("Selecione um registro.")
      throw new Error("Selecione um registro");
    }

    this._notaFiscalDialog ??= await DialogHelper.createDialog(
      this, 
      "siagrob1.view.salesInvoices.fragments.NotaFiscalDialog"
    );

    const ctx = table.getContextByIndex(selectedInvoice[0]);
    const viewModel = this.getModel("viewModel") as JSONModel;
    viewModel.setData({
      TaxDocumentNumber: ctx.getProperty("TaxDocumentNumber") as string,
      TaxDocumentSeries: ctx.getProperty("TaxDocumentSeries") as string,
      ChaveNFe: ctx.getProperty("ChaveNFe") as string,

    });

    void this.openNotaFiscalDialog();
  }

  private openNotaFiscalDialog(){
    this._notaFiscalDialog?.open();
  }

  onCloseNotaFiscalDialog() {
    this._notaFiscalDialog?.close();
  }

  /**
   * A chave de acesso da NF-e tem layout fixo de 44 dígitos, com série e número em posições
   * conhecidas — digitar só a chave já basta para preencher o resto do formulário.
   */
  onChaveNFeLiveChange(ev: Input$LiveChangeEvent) {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const chave = (ev.getParameter("value") || "").replace(/\D/g, "");

    // Número e série são somente leitura: a chave é a única origem deles, então enquanto ela
    // estiver incompleta os dois ficam em branco em vez de manter um valor órfão.
    if (chave.length !== NFE_KEY_LENGTH) {
      viewModel.setProperty("/TaxDocumentSeries", "");
      viewModel.setProperty("/TaxDocumentNumber", "");
      return;
    }

    // Série e número são gravados como estão na chave, zero-preenchidos (série 001, número
    // 000000167) — é assim que o usuário informa manualmente.
    viewModel.setProperty("/TaxDocumentSeries", chave.substring(22, 25));
    viewModel.setProperty("/TaxDocumentNumber", chave.substring(25, 34));
  }

  onNotaFiscalConfirm() {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const notaFiscal = ((viewModel.getProperty("/TaxDocumentNumber") as string) || "").trim();
    const serie = ((viewModel.getProperty("/TaxDocumentSeries") as string) || "").trim();
    const chaveNfe = ((viewModel.getProperty("/ChaveNFe") as string) || "").trim();

    if (!notaFiscal || !serie) {
      MessageBox.warning("Preencha corretamente o formulário.");
      return;
    }

    this.sendDocumentNumber(notaFiscal, serie, chaveNfe, "Documento de saída atualizado com sucesso.");
  }

  /**
   * Limpar é a mesma action com os três campos em branco: o backend já normaliza vazio para
   * null, então não há uma segunda regra de negócio a manter aqui.
   */
  async onNotaFiscalClear() {
    if (!await DialogHelper.confirmDialog("Limpar nota fiscal, série e chave de acesso deste documento ?"))
      return;

    this.sendDocumentNumber("", "", "", "Dados da nota fiscal removidos com sucesso.");
  }

  private sendDocumentNumber(
    documentNumber: string, documentSeries: string, chaveNFe: string, successMessage: string
  ) {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();

    const ctx = table.getContextByIndex(selectedInvoice[0]) as Context;

    const oModel = ctx.getModel() as ODataModel;
    const action = oModel.bindContext("/SalesInvoicesSetDocumentNumber(...)")
    action.setParameter("Key", ctx.getProperty("Key"));
    action.setParameter("DocumentNumber", documentNumber);
    action.setParameter("DocumentSeries", documentSeries);
    action.setParameter("ChaveNFe", chaveNFe);

    this.setBusy(true);
    void action.invoke()
      .then(() => {
        this.onCloseNotaFiscalDialog();
        viewModel.setData({});
        MessageToast.show(successMessage);
        this.refreshData();
      })
      .finally(() => this.setBusy(false));
  }

  async onReturn() {
    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();
    if (selectedInvoice.length == 0){
      MessageBox.warning("Selecione um registro.")
      throw new Error("Selecione um registro");
    }

    const ctx = table.getContextByIndex(selectedInvoice[0]) as Context;

    if (await DialogHelper.confirmDialog("Confirma o retorno deste documento ?")) {
      this.actionReturn(ctx)
    }
  }

  private actionReturn(ctx: Context){
    const action = (this.getModel() as ODataModel).bindContext("/SalesInvoicesReturn(...)");
    action.setParameter("Key", ctx.getProperty("Key"));
    this.setBusy(true);
    void action.invoke()
      .then(() => {
        this.refreshData();
      })
      .finally(() => this.setBusy(false))
  }
}
