import MessageBox from "sap/m/MessageBox";
import { SearchField$SearchEvent } from "sap/m/SearchField";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { signatoryRoleText } from "siagrob1/model/contractDrafts";
import formatter from "siagrob1/model/formatter";
import AppBaseController from "../BaseController";

const TABLE_ID = "tableCompanySignatories";

/**
 * @namespace siagrob1.controller.companySignatories
 */
export default class Main extends AppBaseController {
  formatter = { ...formatter, signatoryRoleText };

  onInit(): void {
    this.getRouter().getRoute("companySignatories")
      .attachPatternMatched(() => this.routeMatched());
  }

  private routeMatched() {
    this.onRefresh();
  }

  onRefresh(): void {
    (this.getView().byId(TABLE_ID).getBinding("rows") as ODataListBinding).refresh();
  }

  onSearch(ev: SearchField$SearchEvent): void {
    const query = ev.getParameter("query");
    const oFilters = new Filter({
      filters: [
        new Filter("Name", FilterOperator.Contains, query),
        new Filter("Email", FilterOperator.Contains, query),
        new Filter("TaxId", FilterOperator.Contains, query),
      ],
      and: false,
    });

    (this.getView().byId(TABLE_ID).getBinding("rows") as ODataListBinding).filter([oFilters]);
  }

  onCreate() {
    this.navTo("companySignatoriesNew");
  }

  onEdit(): void {
    const oTable = this.byId(TABLE_ID) as Table;
    // getSelectedIndices em vez do getSelectedIndex depreciado (removido no UI5 2.x).
    const i = oTable.getSelectedIndices()[0] ?? -1;

    if (i < 0) {
      MessageBox.alert("Selecione um item para editar.");
      return;
    }

    const oContext = oTable.getContextByIndex(i) as Context;
    const sId = oContext.getProperty("Key") as string;

    this.navTo("companySignatoriesEdit", { id: sId });
  }

  async onDelete() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId(TABLE_ID) as Table;
    // getSelectedIndices em vez do getSelectedIndex depreciado (removido no UI5 2.x).
    const i = oTable.getSelectedIndices()[0] ?? -1;

    if (i < 0) {
      MessageBox.alert("Selecione um item para deletar.");
      return;
    }

    const oBindingContext = oTable.getContextByIndex(i) as Context;

    if (await confirmDialog("Deseja realmente deletar este registro ?", "Deletar registro ?")) {
      try {
        this.setBusy(true);

        await oBindingContext.delete("$auto");
        await oModel.submitBatch(oModel.getUpdateGroupId());

        if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
          MessageBox.information("Registro deletado.");
        }
      } finally {
        this.setBusy(false);
      }
    }
  }
}
