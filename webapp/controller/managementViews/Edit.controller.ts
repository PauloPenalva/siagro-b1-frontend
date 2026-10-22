import CommonController from "siagrob1/controller/common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/ui/table/Table";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import { ManagementView, NEW_CODE, ViewLine, loadViews, saveView } from "./ManagementViewApi";

/**
 * Edição de uma visão gerencial: cabeçalho e grade de linhas (gravar substitui as linhas).
 * @namespace siagrob1.controller.managementViews
 */
export default class Edit extends CommonController {
  onInit(): void {
    this.getView().setModel(new JSONModel({ View: null, IsNew: false }), "mv");
    this.getRouter().getRoute("managementViewsEdit").attachPatternMatched((ev: Route$PatternMatchedEvent) => {
      void this.load((ev.getParameter("arguments") as { code: string }).code);
    });
  }

  private model(): JSONModel {
    return this.getView().getModel("mv") as JSONModel;
  }

  private async load(code: string): Promise<void> {
    if (code === NEW_CODE) {
      this.model().setData({ IsNew: true, View: { Code: "", Name: "", Type: "IncomeStatement", Lines: [] } });
      return;
    }
    this.setBusy(true);
    try {
      const view = (await loadViews()).find((v) => v.Code === code);
      if (!view) { MessageBox.error(`Visão gerencial ${code} não encontrada.`); return; }
      view.Lines = [...view.Lines].sort((a, b) => a.Order - b.Order);
      this.model().setData({ IsNew: false, View: view });
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  private lines(): ViewLine[] {
    return (this.model().getProperty("/View/Lines") as ViewLine[]) ?? [];
  }

  onAddLine(): void {
    const lines = this.lines();
    const order = lines.reduce((m, l) => Math.max(m, Number(l.Order) || 0), 0) + 10;
    lines.push({ Order: order, Code: "", Description: "", Kind: "Accounts", Sign: "Plus", Bold: false, Hidden: false });
    this.model().setProperty("/View/Lines", lines);
  }

  onRemoveLine(): void {
    const table = this.byId("managementViewLinesTable") as Table;
    const index = table.getSelectedIndex();
    if (index < 0) { MessageBox.alert("Selecione uma linha."); return; }
    const lines = this.lines();
    lines.splice(index, 1);
    this.model().setProperty("/View/Lines", lines);
    table.clearSelection();
  }

  async onSave(): Promise<void> {
    const view = this.model().getProperty("/View") as ManagementView;
    const text = (v?: string) => (v?.trim() ? v.trim() : null);
    const payload = {
      Code: view.Code?.trim(), Name: view.Name?.trim(), Type: view.Type,
      Lines: this.lines().map((l) => ({
        Order: Number(l.Order) || 0, Code: l.Code?.trim(), Description: l.Description?.trim() ?? "",
        ParentCode: text(l.ParentCode), Kind: l.Kind, AccountFrom: l.Kind === "Accounts" ? text(l.AccountFrom) : null,
        AccountTo: l.Kind === "Accounts" ? text(l.AccountTo) : null, Sign: l.Sign,
        Formula: l.Kind === "Formula" ? text(l.Formula) : null, Bold: !!l.Bold, Hidden: !!l.Hidden,
      })),
    };
    this.setBusy(true);
    try {
      await saveView(payload as unknown as ManagementView);
      MessageToast.show("Visão gerencial gravada.");
      if (this.model().getProperty("/IsNew")) this.navTo("managementViewsEdit", { code: payload.Code });
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }
}
