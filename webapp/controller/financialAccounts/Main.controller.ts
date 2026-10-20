import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

export default class Main extends BaseController {
  formatter = { ...formatter }

  /**
   * O router deste app reaproveita a instancia da view, entao o binding da lista nao refaz a
   * busca sozinho ao voltar de Incluir ou Editar — a conta recem-gravada nao apareceria ate
   * alguem clicar em Atualizar. Mesmo motivo pelo qual ledgerAccounts/Main faz isto.
   */
  onInit(): void {
    this.getRouter().getRoute("financialAccounts")
      .attachPatternMatched(() => this.onRefresh());
  }

  onRefresh(): void {
    (this.byId("financialAccountsTable").getBinding("rows") as ODataListBinding)?.refresh();
  }

  onCreate(): void {
    this.navTo("financialAccountsAdd");
  }

  onEdit(): void {
    const oContext = this.selectedContext();
    if (!oContext) return;

    this.navTo("financialAccountsEdit", { code: oContext.getProperty("Code") as string });
  }

  private selectedContext(): Context | null {
    const oTable = this.byId("financialAccountsTable") as Table;
    const i = oTable.getSelectedIndex();
    if (i < 0) {
      MessageBox.warning("Selecione uma conta financeira.");
      return null;
    }
    return oTable.getContextByIndex(i) as Context;
  }
}
