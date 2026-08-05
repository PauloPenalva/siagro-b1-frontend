import { SearchField$SearchEvent } from "sap/m/SearchField";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Context from "sap/ui/model/odata/v4/Context";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.customerReturns
 */
export default class Main extends BaseController {
  formatter = { ...formatter }

  onInit(): void {
    this.getRouter().getRoute("customerReturns")
      .attachPatternMatched(() => this.onRefresh());
  }

  onRefresh(): void {
    (this.byId("customerReturnsTable").getBinding("rows") as ODataListBinding)?.refresh();
  }

  onSearch(ev: SearchField$SearchEvent): void {
    const query = ev.getParameter("query");

    const oFilters = new Filter({
      filters: [
        new Filter("CardName", FilterOperator.Contains, query),
        new Filter("CardCode", FilterOperator.Contains, query),
        new Filter("DocumentNumber", FilterOperator.Contains, query),
        new Filter("AccessKey", FilterOperator.Contains, query),
      ],
      and: false,
    });

    (this.byId("customerReturnsTable").getBinding("rows") as ODataListBinding)
      .filter([oFilters]);
  }

  onCreate() {
    this.navTo("customerReturnsAdd");
  }

  onDetail() {
    const oContext = this.selectedContext();

    if (!oContext) {
      return;
    }

    this.navTo("customerReturnsDetail", { id: oContext.getProperty("Key") as string });
  }

  /**
   * Cancelar não estorna nada: o documento nunca moveu saldo. Só tira o registro da
   * conciliação e libera a chave de NF-e para relançamento.
   */
  async onCancelReturn() {
    const oContext = this.selectedContext();

    if (!oContext) {
      return;
    }

    if (!await confirmDialog(
      "Cancelar esta devolução ? A chave da NF-e volta a ficar livre.",
      "Cancelar devolução ?")) {
      return;
    }

    const oModel = this.getModel() as ODataModel;

    try {
      this.setBusy(true);

      const action = oModel.bindContext("/CustomerReturnsCancel(...)");
      action.setParameter("Key", oContext.getProperty("Key"));

      await action.invoke();

      MessageToast.show("Devolução cancelada.");
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  private selectedContext(): Context | null {
    const oTable = this.byId("customerReturnsTable") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione uma devolução.");
      return null;
    }

    return oTable.getContextByIndex(i) as Context;
  }
}
