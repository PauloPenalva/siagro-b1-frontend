import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { EdmType } from "sap/ui/export/library";
import CommonController from "siagrob1/controller/common/CommonController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { sendJson, odataValue } from "siagrob1/helpers/FetchHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";
import {
	MovementRow,
	canDeleteEntry,
	isManual,
	monthRange,
	signedEntryAmount,
} from "siagrob1/helpers/FinancialAccountMovementHelpers";

type MovementsResult = {
	OpeningBalance: number; ClosingBalance: number; TotalIn: number; TotalOut: number; Rows: MovementRow[];
};

function emptyEntryDimensions(): Record<string, string> {
	return { CostCenterCode: null, AccountingItemCode: null, DistributionRuleCode: null, LedgerAccountCode: null };
}

/**
 * Lançamentos da conta financeira: baixas de títulos (com juros, multa e desconto) e lançamentos manuais, com saldo
 * anterior, saldo acumulado e marca de conciliado. Inclui/exclui lançamento manual e imprime o extrato do período.
 * Funciona igual em STANDALONE e SAPB1 — o financeiro vive no banco do Siagro nos dois modos.
 * @namespace siagrob1.controller.financialAccountMovements
 */
export default class Main extends CommonController {
	private _entryDialog: Dialog;

	onInit(): void {
		this.getView().setModel(new JSONModel(Main.emptyMovements()), "movements");
		const { from, to } = monthRange(new Date());
		this.createFilterModel({ AccountCode: "", AccountName: "", DateFrom: from, DateTo: to });

		this.getRouter().getRoute("financialAccountMovements")
			.attachPatternMatched(() => { if (this.filter().AccountCode) void this.onSearch(); });
	}

	private static emptyMovements(): MovementsResult {
		return { OpeningBalance: 0, ClosingBalance: 0, TotalIn: 0, TotalOut: 0, Rows: [] };
	}

	private filter(): { AccountCode: string; AccountName: string; DateFrom: string; DateTo: string } {
		return (this.getModel("filter") as JSONModel).getData() as never;
	}

	async openAccountValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
		await this.applyValueHelp(ev, "FinancialAccountsSelectDialog", ["Code", "Name"], "Code",
			[new Filter("Inactive", FilterOperator.EQ, false)]);
	}

	/** Valida conta e período; devolve false (com aviso) se faltar algo. */
	private ensureFilter(): boolean {
		const f = this.filter();
		if (!f.AccountCode) {
			MessageBox.warning("Informe a conta financeira.");
			return false;
		}
		if (!f.DateFrom || !f.DateTo) {
			MessageBox.warning("Informe o período.");
			return false;
		}
		if (f.DateFrom > f.DateTo) {
			MessageBox.warning("A data inicial deve ser menor ou igual à final.");
			return false;
		}
		return true;
	}

	async onSearch(): Promise<void> {
		if (!this.ensureFilter()) return;
		const f = this.filter();
		const code = encodeURIComponent(f.AccountCode.replace(/'/g, "''"));

		this.setBusy(true);
		const result = await sendJson("GET",
			`${this.api.financialAccountsGetMovements}(AccountCode='${code}',DateFrom='${f.DateFrom}',DateTo='${f.DateTo}',OnlyReconciled=false)`);
		this.setBusy(false);

		if (!result.ok) {
			MessageBox.error(result.message);
			return;
		}

		(this.getModel("movements") as JSONModel).setData(odataValue<MovementsResult>(result.data) ?? Main.emptyMovements());
	}

	private selectedRow(): MovementRow {
		const table = this.byId("movementsTable") as Table;
		const index = table.getSelectedIndex();
		if (index < 0) return undefined;
		return table.getContextByIndex(index)?.getObject() as MovementRow;
	}

	async onCreateEntry(): Promise<void> {
		if (!this.filter().AccountCode) {
			MessageBox.warning("Escolha a conta financeira antes de lançar.");
			return;
		}

		(this.getModel("viewModel") as JSONModel).setProperty("/entry", {
			date: localIsoDate(new Date()), type: "Out", amount: 0, description: "", documentReference: "", notes: "",
		});

		this._entryDialog ??= await DialogHelper.createDialog(
			this, "siagrob1.view.financialAccountMovements.fragments.AddEntryDialog");
		// AccountingAssignmentFields liga campos relativos (CostCenterCode, LedgerAccountCode...): o diálogo ganha um modelo padrão JSON próprio e um
		// "ui" editável, sem tocar no OData da tela.
		// Sem contexto de binding o "{CostCenterCode}" relativo não resolve e a escolha nunca chega ao modelo: ancora em "/".
		const entryModel = new JSONModel(emptyEntryDimensions());
		this._entryDialog.setModel(entryModel);
		this._entryDialog.setBindingContext(entryModel.createBindingContext("/"));
		this._entryDialog.setModel(new JSONModel({ editable: true }), "ui");
		this._entryDialog.open();
	}

	onCloseEntryDialog(): void {
		this._entryDialog?.close();
	}

	async onConfirmEntry(): Promise<void> {
		const entry = (this.getModel("viewModel") as JSONModel).getProperty("/entry") as {
			date: string; type: "In" | "Out"; amount: number; description: string; documentReference: string; notes: string;
		};

		const dims = (this._entryDialog.getModel() as JSONModel).getData() as Record<string, string>;
		const amount = signedEntryAmount(entry.type, entry.amount);
		if (!entry.date) { MessageBox.warning("Informe a data do lançamento."); return; }
		if (Number.isNaN(amount)) { MessageBox.warning("Informe um valor maior que zero."); return; }
		if (!entry.description?.trim()) { MessageBox.warning("Informe o histórico do lançamento."); return; }

		this.setBusy(true);
		const result = await sendJson("POST", this.api.financialAccountEntriesCreate, {
			FinancialAccountCode: this.filter().AccountCode,
			EntryDate: entry.date,
			Amount: amount,
			Description: entry.description.trim(),
			DocumentReference: entry.documentReference || null,
			Notes: entry.notes || null,
			// Parâmetros opcionais: vazio vai como null (o servidor aplica o padrão/regra da empresa).
			CostCenterCode: dims.CostCenterCode || null,
			AccountingItemCode: dims.AccountingItemCode || null,
			DistributionRuleCode: dims.DistributionRuleCode || null,
			LedgerAccountCode: dims.LedgerAccountCode || null,
		});
		this.setBusy(false);

		if (!result.ok) {
			MessageBox.error(result.message);
			return;
		}

		this.onCloseEntryDialog();
		MessageToast.show("Lançamento incluído.");
		await this.onSearch();
	}

	onDeleteEntry(): void {
		const row = this.selectedRow();
		if (!row) { MessageBox.warning("Selecione um lançamento."); return; }
		if (!isManual(row)) { MessageBox.warning("Baixa de título se desfaz pelo estorno, no próprio título."); return; }
		if (!canDeleteEntry(row)) {
			MessageBox.warning("Lançamento conciliado não pode ser excluído. Remova a conciliação primeiro.");
			return;
		}

		MessageBox.confirm(`Excluir o lançamento "${row.Description}"?`, {
			onClose: (action: string) => {
				if (action !== MessageBox.Action.OK.toString()) return;
				void (async () => {
					this.setBusy(true);
					const result = await sendJson("DELETE", `${this.api.financialAccountEntries}(${row.Key})`);
					this.setBusy(false);
					if (!result.ok) { MessageBox.error(result.message); return; }
					MessageToast.show("Lançamento excluído.");
					await this.onSearch();
				})();
			},
		});
	}

	onOpenDocument(): void {
		const row = this.selectedRow();
		if (!row?.FinancialDocumentKey) {
			MessageBox.warning("Selecione uma baixa de título.");
			return;
		}
		this.navTo("financialDocumentsDetail", { id: row.FinancialDocumentKey });
	}

	async onPrint(): Promise<void> {
		if (!this.ensureFilter()) return;
		const f = this.filter();
		try {
			this.setBusy(true);
			await openPdfReport(this.api.financialAccountStatementReport, {
				AccountCode: f.AccountCode, DateFrom: f.DateFrom, DateTo: f.DateTo, OnlyReconciled: false,
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}

	onExcel(): void {
		const rows = ((this.getModel("movements") as JSONModel).getProperty("/Rows") as MovementRow[]) ?? [];
		const data = rows.map((r) => ({
			Date: new Date(r.Date),
			Origin: isManual(r) ? "Manual" : "Baixa",
			Description: r.Description,
			DocumentReference: r.DocumentReference ?? "",
			In: Number(r.Amount) > 0 ? Number(r.Amount) : null,
			Out: Number(r.Amount) < 0 ? -Number(r.Amount) : null,
			Balance: Number(r.RunningBalance),
			Reconciled: r.Reconciled ? "Sim" : "Não",
		}));

		const sheet = new Spreadsheet({
			dataSource: data,
			fileName: `Lancamentos-${this.filter().AccountCode}.xlsx`,
			workbook: {
				context: { sheetName: "Lançamentos" },
				columns: [
					{ label: "Data", property: "Date", type: EdmType.Date, format: "dd/mm/yyyy" },
					{ label: "Origem", property: "Origin" },
					{ label: "Histórico", property: "Description", width: 50 },
					{ label: "Documento", property: "DocumentReference" },
					{ label: "Entrada", property: "In", type: EdmType.Number, scale: 2, delimiter: true },
					{ label: "Saída", property: "Out", type: EdmType.Number, scale: 2, delimiter: true },
					{ label: "Saldo", property: "Balance", type: EdmType.Number, scale: 2, delimiter: true },
					{ label: "Conciliado", property: "Reconciled" },
				],
			},
		});
		void sheet.build().finally(() => sheet.destroy());
	}
}
