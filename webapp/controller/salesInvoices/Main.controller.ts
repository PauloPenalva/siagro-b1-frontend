
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
    const filterData = filterModel.getData() as any;
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
      } else {
        filters.push(`contains(${filterKey},'${value}')`)
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

		oBinding.changeParameters({
      $filter: filterParam
    });
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
      TaxDocumentNumber: ctx.getProperty("TaxDocumentNumber"),
      TaxDocumentSeries: ctx.getProperty("TaxDocumentSeries"),
      ChaveNFe: ctx.getProperty("ChaveNFe"),

    });

    this.openNotaFiscalDialog();
  }

  private async openNotaFiscalDialog(){
    this._notaFiscalDialog?.open();
  }

  onCloseNotaFiscalDialog() {
    this._notaFiscalDialog?.close();
  }

  async onNotaFiscalConfirm() {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const notaFiscal = viewModel.getProperty("/TaxDocumentNumber");
    const serie = viewModel.getProperty("/TaxDocumentSeries");
    const chaveNfe = viewModel.getProperty("/ChaveNFe");

    if (!notaFiscal || !serie) {
      MessageBox.warning("Preencha corretamente o formulário.");
      throw new Error("Preencha corretamente o formulário.");
    }

    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();

    const ctx = table.getContextByIndex(selectedInvoice[0]) as Context;
    
    const oModel = ctx.getModel() as ODataModel;
    const action = oModel.bindContext("/SalesInvoicesSetDocumentNumber(...)")
    action.setParameter("Key", ctx.getProperty("Key"));
    action.setParameter("DocumentNumber", notaFiscal );
    action.setParameter("DocumentSeries", serie );
    action.setParameter("ChaveNFe", chaveNfe );

    this.setBusy(true);
    action.invoke()
      .then(() => {
        this.onCloseNotaFiscalDialog();
        viewModel.setData({});
        MessageToast.show("Documento de saída atualizado com sucesso.");
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
    action.invoke()
      .then(() => {
        this.refreshData();
      })
      .finally(() => this.setBusy(false))
  }
}
