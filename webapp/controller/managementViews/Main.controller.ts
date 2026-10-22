import CommonController from "siagrob1/controller/common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import { Link$PressEvent } from "sap/m/Link";
import { NEW_CODE, TYPE_TEXT, loadViews } from "./ManagementViewApi";

/**
 * Visões gerenciais (CTS): estrutura da DRE e do Balanço sobre o plano de contas.
 * @namespace siagrob1.controller.managementViews
 */
export default class Main extends CommonController {
  onInit(): void {
    this.getView().setModel(new JSONModel({ Rows: [] }), "mv");
    this.getRouter().getRoute("managementViews").attachPatternMatched(() => void this.onRefresh());
  }

  async onRefresh(): Promise<void> {
    this.setBusy(true);
    try {
      const rows = (await loadViews()).map((v) => ({
        Code: v.Code, Name: v.Name, TypeText: TYPE_TEXT[v.Type] ?? v.Type, LineCount: v.Lines?.length ?? 0,
        EmptyRanges: (v.Lines ?? []).filter((l) => l.Kind === "Accounts" && !l.AccountFrom).length,
      }));
      (this.getView().getModel("mv") as JSONModel).setProperty("/Rows", rows);
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  onOpen(ev: Link$PressEvent): void {
    this.navTo("managementViewsEdit", { code: ev.getSource().getBindingContext("mv").getProperty("Code") as string });
  }

  onNew(): void {
    this.navTo("managementViewsEdit", { code: NEW_CODE });
  }
}
