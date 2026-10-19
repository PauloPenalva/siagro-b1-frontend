import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import Table from "sap/ui/table/Table";
import CommonController from "siagrob1/controller/common/CommonController";
import { sendJson, odataValue } from "siagrob1/helpers/FetchHelpers";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";
import {
	MovementRow,
	markedKeys,
	monthStart,
	reconciliationChanges,
	reconciliationSummary,
	statementDay,
} from "siagrob1/helpers/FinancialAccountMovementHelpers";

type ReconciliationView = {
	Key: string; FinancialAccountCode: string; AccountName: string; StatementDate: string; Status: string;
	OpeningBalance: number; StatementBalance: number; ReconciledAmount: number; Difference: number; Rows: MovementRow[];
};

/**
 * Detalhe da reconciliação: marca as linhas que estão no extrato do banco e recalcula a diferença na hora; fecha com
 * diferença zero. Fechada, só reabre (a última da conta) — é o caminho para remover a conciliação de um lançamento
 * antes de estorná-lo ou excluí-lo.
 * @namespace siagrob1.controller.financialAccountReconciliations
 */
export default class Detail extends CommonController {
	private _key: string;
	/** Seleção aplicada pelo código: não recalcula a cada linha marcada no carregamento. */
	private _applyingSelection = false;

	onInit(): void {
		this.getView().setModel(new JSONModel({ Rows: [] }), "rec");
		this.getRouter().getRoute("financialAccountReconciliationsDetail")
			.attachPatternMatched((ev: Route$PatternMatchedEvent) => {
				this._key = (ev.getParameter("arguments") as { key: string }).key;
				void this.load();
			});
	}

	private model(): JSONModel {
		return this.getModel("rec") as JSONModel;
	}

	private table(): Table {
		return this.byId("linesTable") as Table;
	}

	private async load(): Promise<void> {
		const key = this._key;
		this.setBusy(true);
		const [header, lines] = await Promise.all([
			sendJson("GET", `${this.api.financialAccountReconciliations}(${key})?$expand=FinancialAccount($select=Name)`),
			sendJson("GET", `${this.api.financialAccountReconciliationsGetLines}(Key=${key})`),
		]);
		this.setBusy(false);
		if (key !== this._key) return;

		if (!header.ok || !lines.ok) {
			MessageBox.error((header.ok ? lines : header).message);
			return;
		}

		const h = header.data as {
			Key: string; FinancialAccountCode: string; StatementDate: string; Status: string; FinancialAccount?: { Name: string };
		};
		const l = odataValue<Omit<ReconciliationView, "Key">>(lines.data);

		this.model().setData({
			...l,
			Key: h.Key,
			FinancialAccountCode: h.FinancialAccountCode,
			AccountName: h.FinancialAccount?.Name ?? "",
			StatementDate: h.StatementDate,
			Status: h.Status,
		});

		this.applyMarkedSelection();
	}

	/** Reflete na tabela o que já está marcado no servidor. */
	private applyMarkedSelection(): void {
		const table = this.table();
		const rows = (this.model().getProperty("/Rows") as MovementRow[]) ?? [];
		this._applyingSelection = true;
		try {
			table.clearSelection();
			rows.forEach((row, index) => { if (row.Marked) table.addSelectionInterval(index, index); });
		} finally {
			this._applyingSelection = false;
		}
		this.onSelectionChange();
	}

	private selectedKeys(): Set<string> {
		const rows = (this.model().getProperty("/Rows") as MovementRow[]) ?? [];
		return new Set(this.table().getSelectedIndices().map((i) => rows[i]?.Key).filter(Boolean));
	}

	onSelectionChange(): void {
		if (this._applyingSelection) return;
		const data = this.model().getData() as ReconciliationView;
		// Fechada: a tabela fica sem seleção (selectionMode None); o quadro vem das marcações do servidor.
		const keys = data.Status === "Closed" ? markedKeys(data.Rows) : this.selectedKeys();
		const summary = reconciliationSummary(data.Rows ?? [], keys, data.OpeningBalance, data.StatementBalance);
		this.model().setProperty("/ReconciledAmount", summary.reconciledAmount);
		this.model().setProperty("/Difference", summary.difference);
	}

	/** Grava só a diferença entre o que estava marcado e o que está selecionado. */
	private async save(): Promise<boolean> {
		const rows = (this.model().getProperty("/Rows") as MovementRow[]) ?? [];
		const changes = reconciliationChanges(rows, this.selectedKeys());
		const nothing = Object.values(changes).every((list: string[]) => list.length === 0);
		if (nothing) return true;

		this.setBusy(true);
		const result = await sendJson("POST", this.api.financialAccountReconciliationsSetLines, { Key: this._key, ...changes });
		this.setBusy(false);

		if (!result.ok) {
			MessageBox.error(result.message);
			return false;
		}
		return true;
	}

	async onSave(): Promise<void> {
		if (!(await this.save())) return;
		MessageToast.show("Marcações salvas.");
		await this.load();
	}

	async onClose(): Promise<void> {
		if (!(await this.save())) return;
		await this.runAction(this.api.financialAccountReconciliationsClose, "Reconciliação fechada.");
	}

	async onReopen(): Promise<void> {
		await this.runAction(this.api.financialAccountReconciliationsReopen, "Reconciliação reaberta.");
	}

	onDelete(): void {
		MessageBox.confirm("Excluir esta reconciliação? As linhas marcadas voltam a ficar pendentes.", {
			onClose: (action: string) => {
				if (action !== MessageBox.Action.OK.toString()) return;
				void (async () => {
					this.setBusy(true);
					const result = await sendJson("POST", this.api.financialAccountReconciliationsDelete, { Key: this._key });
					this.setBusy(false);
					if (!result.ok) { MessageBox.error(result.message); return; }
					MessageToast.show("Reconciliação excluída.");
					this.navTo("financialAccountReconciliations", {}, true);
				})();
			},
		});
	}

	private async runAction(url: string, success: string): Promise<void> {
		this.setBusy(true);
		const result = await sendJson("POST", url, { Key: this._key });
		this.setBusy(false);
		if (!result.ok) {
			MessageBox.error(result.message);
			return;
		}
		MessageToast.show(success);
		await this.load();
	}

	/** Extrato só dos conciliados, do primeiro dia do mês do extrato até a data dele. */
	async onPrint(): Promise<void> {
		const data = this.model().getData() as ReconciliationView;
		try {
			this.setBusy(true);
			await openPdfReport(this.api.financialAccountStatementReport, {
				AccountCode: data.FinancialAccountCode,
				DateFrom: monthStart(data.StatementDate),
				DateTo: statementDay(data.StatementDate),
				OnlyReconciled: true,
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}

	onBack(): void {
		this.navTo("financialAccountReconciliations", {}, true);
	}
}
