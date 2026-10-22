import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";
import Sorter from "sap/ui/model/Sorter";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { monthRange } from "siagrob1/helpers/FinancialAccountMovementHelpers";

type TransferForm = { from: string; to: string; date: string; amount: number; description: string; notes: string };

/**
 * Transferências entre contas financeiras: lista por período e conta (origem ou destino), inclui uma transferência
 * (saída na origem + entrada no destino) e exclui as duas pernas. Funciona em STANDALONE e SAPB1.
 * @namespace siagrob1.controller.financialAccountTransfers
 */
export default class Main extends CommonController {
	private _transferDialog: Dialog;

	onInit(): void {
		const { from, to } = monthRange(new Date());
		this.createFilterModel({ AccountCode: "", DateFrom: from, DateTo: to });
		this.getView().setModel(new JSONModel({}), "transfer");

		this.getRouter().getRoute("financialAccountTransfers")
			.attachPatternMatched(() => this.onSearch());
	}

	private filter(): { AccountCode: string; DateFrom: string; DateTo: string } {
		return (this.getModel("filter") as JSONModel).getData() as never;
	}

	private transferModel(): JSONModel {
		return this.getModel("transfer") as JSONModel;
	}

	private table(): Table {
		return this.byId("transfersTable") as Table;
	}

	private static localMidnight(iso: string, addDays = 0): Date {
		const [y, m, d] = iso.split("-").map(Number);
		return new Date(y, m - 1, d + addDays);
	}

	async openAccountValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		await this.applyValueHelp(ev, "FinancialAccountsSelectDialog", ["Code", "Name"], "Code");
		(this.getModel("filter") as JSONModel).setProperty("/AccountCode", ev.getSource().getValue());
	}

	onSearch(): void {
		const f = this.filter();
		if (f.DateFrom && f.DateTo && f.DateFrom > f.DateTo) {
			MessageBox.warning("A data inicial deve ser menor ou igual à final.");
			return;
		}
		const filters: Filter[] = [];
		// Meia-noite local; "até" inclui o último dia (LT do dia seguinte). O valor vai como literal ISO do
		// Edm.DateTimeOffset: um Date cru vira o texto do JavaScript e o servidor recusa a URL.
		if (f.DateFrom) filters.push(new Filter("TransferDate", FilterOperator.GE, Main.localMidnight(f.DateFrom).toISOString()));
		if (f.DateTo) filters.push(new Filter("TransferDate", FilterOperator.LT, Main.localMidnight(f.DateTo, 1).toISOString()));
		const account = f.AccountCode?.trim();
		if (account) {
			filters.push(new Filter({
				filters: [
					new Filter("FromAccountCode", FilterOperator.EQ, account),
					new Filter("ToAccountCode", FilterOperator.EQ, account),
				],
				and: false,
			}));
		}
		// Ligado no código, e não no XML com `suspended: true`: na volta à tela o UI5 recria o binding a partir da
		// definição; recriado suspenso, a tabela renderizava antes do resume e abortava. Filtros soltos no mesmo
		// campo saem com "or": embrulha tudo em "and".
		this.table().bindRows({
			path: "/FinancialAccountTransfers",
			sorter: new Sorter("TransferDate", true),
			filters: filters.length ? [new Filter({ filters, and: true })] : [],
		});
	}

	async onTransfer(): Promise<void> {
		// Data local: toISOString devolveria o dia em UTC e, à noite, o dia seguinte.
		const form: TransferForm = {
			from: "", to: "", date: localIsoDate(new Date()), amount: 0, description: "", notes: "",
		};
		this.transferModel().setData(form);
		this._transferDialog ??= await DialogHelper.createDialog(
			this, "siagrob1.view.financialAccountTransfers.fragments.TransferDialog");
		this._transferDialog.open();
	}

	onCloseTransfer(): void {
		this._transferDialog?.close();
	}

	private async pickActiveAccount(ev: Input$ValueHelpRequestEvent, path: string): Promise<void> {
		await this.applyValueHelp(ev, "FinancialAccountsSelectDialog", ["Code", "Name"], "Code",
			[new Filter("Inactive", FilterOperator.EQ, false)]);
		this.transferModel().setProperty(path, ev.getSource().getValue());
	}

	onFromAccountValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		return this.pickActiveAccount(ev, "/from");
	}

	onToAccountValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		return this.pickActiveAccount(ev, "/to");
	}

	async onConfirmTransfer(): Promise<void> {
		const t = this.transferModel().getData() as TransferForm;
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
		this.onSearch();
	}

	onDeleteTransfer(): void {
		const table = this.table();
		const index = table.getSelectedIndex();
		if (index < 0) { MessageBox.warning("Selecione uma transferência."); return; }
		const key = (table.getContextByIndex(index) as Context).getProperty("Key") as string;

		MessageBox.confirm("Excluir a transferência e os dois lançamentos?", {
			onClose: (action: string) => {
				if (action !== MessageBox.Action.OK.toString()) return;
				void (async () => {
					this.setBusy(true);
					const result = await sendJson("DELETE", `${this.api.financialAccountTransfers}(${key})`);
					this.setBusy(false);
					if (!result.ok) { MessageBox.error(result.message); return; }
					MessageToast.show("Transferência excluída.");
					table.clearSelection();
					this.onSearch();
				})();
			},
		});
	}
}
