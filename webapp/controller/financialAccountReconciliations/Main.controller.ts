import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import { RowActionItem$PressEvent } from "sap/ui/table/RowActionItem";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { sendJson, odataValue } from "siagrob1/helpers/FetchHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";

/**
 * Reconciliações de conta financeira contra o extrato do banco: lista e abertura de uma nova (conta, data e saldo
 * final do extrato). A marcação das linhas, o fechamento e a reabertura ficam no Detail.
 * @namespace siagrob1.controller.financialAccountReconciliations
 */
export default class Main extends CommonController {
	private _createDialog: Dialog;

	onInit(): void {
		this.getRouter().getRoute("financialAccountReconciliations")
			.attachPatternMatched(() => this.onRefresh());
	}

	onRefresh(): void {
		((this.byId("reconciliationsTable") as Table).getBinding("rows") as ODataListBinding)?.refresh();
	}

	async onCreate(): Promise<void> {
		(this.getModel("viewModel") as JSONModel).setProperty("/reconciliation", {
			AccountCode: "", AccountName: "", StatementDate: localIsoDate(new Date()), StatementBalance: 0, Notes: "",
		});
		this._createDialog ??= await DialogHelper.createDialog(
			this, "siagrob1.view.financialAccountReconciliations.fragments.OpenReconciliationDialog");
		this._createDialog.open();
	}

	onCloseCreateDialog(): void {
		this._createDialog?.close();
	}

	async openAccountValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		await this.applyValueHelp(ev, "FinancialAccountsSelectDialog", ["Code", "Name"], "Code",
			[new Filter("Inactive", FilterOperator.EQ, false)]);
	}

	async onConfirmCreate(): Promise<void> {
		const form = (this.getModel("viewModel") as JSONModel).getProperty("/reconciliation") as {
			AccountCode: string; StatementDate: string; StatementBalance: number; Notes: string;
		};

		if (!form.AccountCode) { MessageBox.warning("Informe a conta financeira."); return; }
		if (!form.StatementDate) { MessageBox.warning("Informe a data do extrato."); return; }

		this.setBusy(true);
		const result = await sendJson("POST", this.api.financialAccountReconciliationsOpen, {
			FinancialAccountCode: form.AccountCode,
			StatementDate: form.StatementDate,
			StatementBalance: Number(form.StatementBalance ?? 0),
			Notes: form.Notes || null,
		});
		this.setBusy(false);

		if (!result.ok) {
			MessageBox.error(result.message);
			return;
		}

		this.onCloseCreateDialog();
		this.navTo("financialAccountReconciliationsDetail", { key: odataValue<string>(result.data) });
	}

	onOpen(): void {
		const table = this.byId("reconciliationsTable") as Table;
		const ctx = table.getContextByIndex(table.getSelectedIndex()) as Context;
		if (!ctx) {
			MessageBox.warning("Selecione uma reconciliação.");
			return;
		}
		this.navTo("financialAccountReconciliationsDetail", { key: ctx.getProperty("Key") as string });
	}

	onRowNavigate(ev: RowActionItem$PressEvent): void {
		const ctx = ev.getParameter("row").getBindingContext() as Context;
		this.navTo("financialAccountReconciliationsDetail", { key: ctx.getProperty("Key") as string });
	}
}
