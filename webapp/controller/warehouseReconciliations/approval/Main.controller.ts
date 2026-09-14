import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import SearchField, { SearchField$SearchEvent } from "sap/m/SearchField";
import IconTabBar from "sap/m/IconTabBar";
import IconTabFilter from "sap/m/IconTabFilter";
import { ListBase$ItemPressEvent } from "sap/m/ListBase";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * @namespace siagrob1.controller.warehouseReconciliations.approval
 */
export default class Main extends CommonController {

  onInit(): void {
    this.getRouter().getRoute("warehouseReconciliationsApproval")
      .attachPatternMatched(() => {
        this.onFilterSelect();
        this.refreshApprovalList();
      });
  }

  onSearch(ev: SearchField$SearchEvent): void {
    const query = ev?.getParameter("query")?.trim().replace(/'/g, "''");
    const status = (this.byId("warehouseReconciliationsApprovalIconTabBar") as IconTabBar).getSelectedKey() || "InApproval";
    let filter = `Status eq '${status}'`;

    if (query) {
      filter += ` and (${[
        `contains(Code,'${query}')`,
        `contains(WarehouseCode,'${query}')`,
        `contains(WarehouseName,'${query}')`,
        `contains(ItemCode,'${query}')`,
        `contains(ItemName,'${query}')`,
      ].join(" or ")})`;
    }

    (this.byId("warehouseReconciliationsApprovalTable").getBinding("items") as ODataListBinding)
      .changeParameters({ $filter: filter });
  }

  onFilterSelect(): void {
    const searchField = this.byId("warehouseReconciliationsApprovalSearchField") as SearchField;
    searchField.fireSearch({ query: searchField.getValue() });
  }

  onRefresh(): void {
    this.refreshApprovalList();
  }

  /**
   * Aprovar/Rejeitar acontece via `fetch` fora do modelo OData: ao voltar para a lista,
   * `changeParameters` sozinho não recarrega se a aba e a busca não mudaram, deixando a
   * conferência decidida na aba errada e os badges de contagem desatualizados.
   */
  private refreshApprovalList(): void {
    (this.byId("warehouseReconciliationsApprovalIconTabBar") as IconTabBar)
      ?.getItems().forEach((item) => (item as IconTabFilter).getBinding("count")?.refresh());
    (this.byId("warehouseReconciliationsApprovalTable")?.getBinding("items") as ODataListBinding)?.refresh();
  }

  onNavigateToDetail(ev: ListBase$ItemPressEvent): void {
    const id = (ev.getSource()?.getBindingContext() as Context)?.getProperty("Key") as string;
    if (id) {
      this.navTo("warehouseReconciliationsApprovalDetail", { id });
    }
  }
}
