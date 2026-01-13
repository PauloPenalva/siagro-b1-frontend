
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import Table from "sap/ui/table/Table";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { BaseController } from "../BaseController";
import MessageToast from "sap/m/MessageToast";
import { SearchField$SearchEvent } from "sap/m/SearchField";


/**
 * @namespace siagrob1.controller.salesInvoices.reconciliation
 */
export default class Main extends BaseController {

  formatter = formatter;

	onInit(): void  {
    this.getRouter().getRoute("salesInvoicesReconciliation")
      .attachPatternMatched(() => {
        this.onSearch({ query: ''} as unknown as SearchField$SearchEvent)
      });
	}

	onSearch(ev: SearchField$SearchEvent): void {
    const query = ev.getParameter("query");
    const oBinding = this.getView()
      .byId("tableSalesInvoicesReconciliation")
      .getBinding("rows") as ODataListBinding;

    let filterParam = 'DeliveryStatus eq \'Open\' and SalesInvoice/InvoiceType eq \'Normal\' and SalesInvoice/InvoiceStatus eq \'Confirmed\''
    
    if (query) {
      filterParam += `and contains(SalesInvoice/TaxDocumentNumber,'${query}')`
    }

    oBinding.changeParameters({
      $filter: filterParam
    });
	}

  private refreshData() {
    const oTable = this.byId("tableSalesInvoicesReconciliation") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }

  async onSave() {
    const oModel = this.getModel() as ODataModel;
    try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      	MessageToast.show("Dados salvos com sucesso.");
        this.refreshData();
			}
		} finally {
			this.setBusy(false);
		}
  }

  onCancel() {
    const oModel = this.getView().getModel() as ODataModel;
    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
      MessageToast.show("Digitação cancelada.");
      this.refreshData();
    }
  }
}
