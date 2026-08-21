
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import Table from "sap/ui/table/Table";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { BaseController } from "../BaseController";
import MessageToast from "sap/m/MessageToast";


/**
 * @namespace siagrob1.controller.salesInvoices.reconciliation
 */
export default class Main extends BaseController {

  formatter = formatter;

  /**
   * Escopo da tela, não filtro: esta é a fila do que falta conferir, e conferir entrega só
   * faz sentido em documento de saída normal e confirmado. Nunca aparece na filterbar e
   * nunca sai do $filter — nem quando o usuário limpa a barra.
   */
  private static readonly SCOPE =
    "SalesInvoice/InvoiceType eq 'Normal' and SalesInvoice/InvoiceStatus eq 'Confirmed' " +
    "and DeliveryStatus eq 'Open'";

	onInit(): void  {
    this.createFilterModel();

    this.getRouter().getRoute("salesInvoicesReconciliation")
      .attachPatternMatched(() => this.applyFilters());
	}

	onSearch(): void {
    this.applyFilters();
	}

  onClearFilters(): void {
    this.clearFilters();
    this.applyFilters();
  }

  private applyFilters(): void {
    this.applyReconciliationFilters("tableSalesInvoicesReconciliation", Main.SCOPE);
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
