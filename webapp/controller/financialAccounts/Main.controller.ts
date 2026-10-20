import Fragment from "sap/ui/core/Fragment";
import Dialog from "sap/m/Dialog";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/m/Table";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import ListBinding from "sap/ui/model/ListBinding";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";
import GridTable from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

export default class Main extends BaseController {
  formatter = { ...formatter }

  private _transferDialog: Dialog;
  private _transfersDialog: Dialog;

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
    const oTable = this.byId("financialAccountsTable") as GridTable;
    const i = oTable.getSelectedIndex();
    if (i < 0) {
      MessageBox.warning("Selecione uma conta financeira.");
      return null;
    }
    return oTable.getContextByIndex(i) as Context;
  }

  private viewModel(): JSONModel {
    return this.getModel("viewModel") as JSONModel;
  }

  async onTransfer(): Promise<void> {
    // Data local: toISOString devolveria o dia em UTC e, a noite, o dia seguinte.
    this.viewModel().setProperty("/transfer", {
      from: "", to: "", date: localIsoDate(new Date()), amount: 0, description: "", notes: "",
    });
    this._transferDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialAccounts.fragments.TransferDialog");
    this._transferDialog.open();
  }

  onCloseTransfer(): void {
    this._transferDialog?.close();
  }

  private async pickActiveAccount(ev: Input$ValueHelpRequestEvent, path: string): Promise<void> {
    await this.applyValueHelp(ev, "FinancialAccountsSelectDialog", ["Code", "Name"], "Code",
      [new Filter("Inactive", FilterOperator.EQ, false)]);
    this.viewModel().setProperty(path, ev.getSource().getValue());
  }

  onFromAccountValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
    return this.pickActiveAccount(ev, "/transfer/from");
  }

  onToAccountValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
    return this.pickActiveAccount(ev, "/transfer/to");
  }

  async onConfirmTransfer(): Promise<void> {
    const t = this.viewModel().getProperty("/transfer") as {
      from: string; to: string; date: string; amount: number; description: string; notes: string;
    };
    const amount = Number(t.amount);

    if (!t.from) { MessageBox.warning("Informe a conta de origem."); return; }
    if (!t.to) { MessageBox.warning("Informe a conta de destino."); return; }
    if (t.from === t.to) { MessageBox.warning("A conta de origem deve ser diferente da conta de destino."); return; }
    if (!t.date) { MessageBox.warning("Informe a data da transferência."); return; }
    if (!(amount > 0)) { MessageBox.warning("Informe um valor maior que zero."); return; }

    this.setBusy(true);
    const result = await sendJson("POST", this.api.financialAccountTransfersCreate, {
      FromAccountCode: t.from,
      ToAccountCode: t.to,
      TransferDate: t.date,
      Amount: amount,
      Description: t.description?.trim() || null,
      Notes: t.notes?.trim() || null,
    });
    this.setBusy(false);

    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    this.onCloseTransfer();
    MessageToast.show("Transferência registrada.");
  }

  async onOpenTransfers(): Promise<void> {
    this.viewModel().setProperty("/transfers", { from: "", to: "" });
    this._transfersDialog ??= await DialogHelper.createDialog(
      this, "siagrob1.view.financialAccounts.fragments.TransfersDialog");
    this.onFilterTransfers();
    this._transfersDialog.open();
  }

  onCloseTransfers(): void {
    this._transfersDialog?.close();
  }

  private transfersTable(): Table {
    return Fragment.byId(this.getView().getId() + "_siagrob1.view.financialAccounts.fragments.TransfersDialog",
      "transfersTable") as Table;
  }

  onFilterTransfers(): void {
    const range = this.viewModel().getProperty("/transfers") as { from: string; to: string };
    const filters: Filter[] = [];
    if (range.from) filters.push(new Filter("TransferDate", FilterOperator.GE, range.from));
    if (range.to) filters.push(new Filter("TransferDate", FilterOperator.LE, range.to));
    (this.transfersTable().getBinding("items") as ListBinding).filter(filters);
  }

  onDeleteTransfer(): void {
    const table = this.transfersTable();
    const item = table.getSelectedItem();
    if (!item) { MessageBox.warning("Selecione uma transferência."); return; }
    const key = item.getBindingContext().getProperty("Key") as string;

    MessageBox.confirm("Excluir a transferência e os dois lançamentos?", {
      onClose: (action: string) => {
        if (action !== MessageBox.Action.OK.toString()) return;
        void (async () => {
          this.setBusy(true);
          const result = await sendJson("DELETE", `${this.api.financialAccountTransfers}(${key})`);
          this.setBusy(false);
          if (!result.ok) { MessageBox.error(result.message); return; }
          MessageToast.show("Transferência excluída.");
          (table.getBinding("items") as ODataListBinding).refresh();
        })();
      },
    });
  }
}
