import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { contractTemplateFilter } from "siagrob1/helpers/ContractTemplateFilters";
import { TEMPLATE_SCOPE_OPTIONS, templateScopeText } from "siagrob1/model/contractDrafts";
import formatter from "siagrob1/model/formatter";
import BaseController from "../BaseController";

const TABLE_ID = "tableContractTemplates";

/**
 * @namespace siagrob1.controller.contractTemplates
 */
export default class Main extends BaseController {
  formatter = { ...formatter, templateScopeText };

  onInit(): void {
    // "Todos" entra aqui, e não como item solto no XML: um Select com `items` ligado usa o
    // filho do XML como TEMPLATE da lista, então um item estático ao lado dele não sobrevive.
    this.getView().setModel(
      new JSONModel({
        scopes: [{ key: "", text: "Todos" }, ...TEMPLATE_SCOPE_OPTIONS],
        filter: { query: "", scope: "", active: "" },
      }),
      "options"
    );

    this.getRouter().getRoute("contractTemplates")
      .attachPatternMatched(() => this.routeMatched());
  }

  private routeMatched() {
    this.applyFilter();
  }

  private binding(): ODataListBinding {
    return (this.byId(TABLE_ID) as Table).getBinding("rows") as ODataListBinding;
  }

  onRefresh(): void {
    this.binding().refresh();
  }

  /**
   * Busca, escopo e ativo viram UM `$filter`, e não `Filter` de aplicação: `ContractType` é enum,
   * e o modelo V4 estoura "Unsupported type" ao serializar o literal de um enum num `Filter`.
   */
  onFilterChange(): void {
    this.applyFilter();
  }

  private applyFilter(): void {
    const { query, scope, active } = (this.getModel("options") as JSONModel)
      .getProperty("/filter") as { query: string; scope: string; active: string };

    this.binding().changeParameters({ $filter: contractTemplateFilter(query, scope, active) });
  }

  onCreate(): void {
    this.navTo("contractTemplatesNew");
  }

  onEdit(): void {
    const oContext = this.selected();

    if (!oContext) {
      MessageBox.alert("Selecione um item para editar.");
      return;
    }

    this.navTo("contractTemplatesEdit", { id: oContext.getProperty("Key") as string });
  }

  private selected(): Context {
    const oTable = this.byId(TABLE_ID) as Table;
    const index = oTable.getSelectedIndices()[0] ?? -1;

    return index < 0 ? undefined : (oTable.getContextByIndex(index) as Context);
  }

  async onDelete(): Promise<void> {
    const oContext = this.selected();

    if (!oContext) {
      MessageBox.alert("Selecione um item para excluir.");
      return;
    }

    if (!await confirmDialog("Deseja realmente excluir este modelo ?", "Excluir modelo ?")) {
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oContext.delete("$auto");
      await oModel.submitBatch(oModel.getUpdateGroupId());

      MessageToast.show("Modelo excluído.", { closeOnBrowserNavigation: false });
    } catch (err) {
      // A mensagem é do SERVIDOR: é ele que sabe quantas minutas já saíram deste modelo, e a
      // recusa precisa dizer isso. Mensagem genérica aqui esconderia o motivo.
      MessageBox.error((err as Error).message || "Não foi possível excluir o modelo.");
    } finally {
      this.setBusy(false);
    }
  }
}
