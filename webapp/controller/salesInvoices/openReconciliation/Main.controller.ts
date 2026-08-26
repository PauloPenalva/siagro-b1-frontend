
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import Table from "sap/ui/table/Table";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { BaseController } from "../BaseController";
import MessageToast from "sap/m/MessageToast";
import Context from "sap/ui/model/odata/v4/Context";
import { Button$PressEvent } from "sap/m/Button";


/**
 * @namespace siagrob1.controller.salesInvoices.openReconciliation
 */
export default class Main extends BaseController {

  formatter = formatter;

  /**
   * Escopo da tela, não filtro: esta é a fila do que já foi conferido e pode ser estornado,
   * e estorno só faz sentido em documento de saída normal e confirmado. Nunca aparece na
   * filterbar e nunca sai do $filter — nem quando o usuário limpa a barra.
   */
  private static readonly SCOPE =
    "SalesInvoice/InvoiceType eq 'Normal' and SalesInvoice/InvoiceStatus eq 'Confirmed' " +
    "and DeliveryStatus eq 'Closed'";

	onInit(): void  {
    this.createFilterModel();

    this.getRouter().getRoute("salesInvoicesOpenReconciliation")
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
    this.applyReconciliationFilters("tableSalesInvoicesOpenReconciliation", Main.SCOPE);
  }

  private refreshData() {
    const oTable = this.byId("tableSalesInvoicesOpenReconciliation") as Table;
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

  /** Log de modificações da linha clicada. Ver openItemChangeLogs no BaseController. */
  onOpenItemChangeLogs(oEvent: Button$PressEvent): void {
    void this.openItemChangeLogs(oEvent.getSource().getBindingContext() as Context);
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
