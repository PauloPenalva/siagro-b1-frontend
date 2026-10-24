import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import GridTable from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { dateText } from "siagrob1/helpers/FreightOrderHelpers";
import {
	FREIGHT_INVOICE_STATUSES, FreightInvoicesFilter, buildFreightInvoiceBatchPayload, buildFreightInvoicesFilter,
	freightInvoiceStatusState, freightInvoiceStatusText,
} from "siagrob1/helpers/FreightInvoiceHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import BaseController from "../BaseController";

type BatchForm = { BranchCode: string; From: string; To: string; TakerCardCode: string; TakerName: string; Issue: boolean };

/**
 * Lista de faturas de frete (TMS, só STANDALONE). Filtros vão como $filter cru (Status é enum).
 * "Gerar em lote" cria um rascunho por tomador com os CT-e elegíveis do período (opcionalmente já emite).
 * @namespace siagrob1.controller.freightInvoices
 */
export default class Main extends BaseController {
	statusText = freightInvoiceStatusText;
	statusState = freightInvoiceStatusState;
	dateText = dateText;

	private batchDialog: Dialog;

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "filter");
		this.getView().setModel(new JSONModel(FREIGHT_INVOICE_STATUSES), "statuses");
		this.getView().setModel(new JSONModel({}), "batch");
		this.getRouter().getRoute("freightInvoices").attachPatternMatched(() => {
			void this.refreshStandaloneFlag();
			this.applyFilters();
		});
	}

	private filter(): JSONModel {
		return this.getView().getModel("filter") as JSONModel;
	}

	private batch(): JSONModel {
		return this.getView().getModel("batch") as JSONModel;
	}

	private binding(): ODataListBinding {
		return this.byId("tableFreightInvoices").getBinding("rows") as ODataListBinding;
	}

	private applyFilters(): void {
		this.binding()?.changeParameters({ $filter: buildFreightInvoicesFilter(this.filter().getData() as FreightInvoicesFilter) });
	}

	onSearch(): void {
		this.applyFilters();
	}

	onClearFilters(): void {
		this.filter().setData({});
		this.applyFilters();
	}

	onRefresh(): void {
		this.binding()?.refresh();
	}

	async onPickTaker(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"]);
		if (ctx) {
			this.filter().setProperty("/TakerCardCode", ctx.getProperty("CardCode"));
			this.filter().setProperty("/TakerName", ctx.getProperty("CardName"));
		}
	}

	onCreate(): void {
		this.navTo("freightInvoicesNew");
	}

	onDetail(): void {
		const table = this.byId("tableFreightInvoices") as GridTable;
		const index = table.getSelectedIndices()[0];
		if (index === undefined) {
			MessageBox.alert("Selecione uma fatura de frete para visualizar.");
			return;
		}
		const ctx = table.getContextByIndex(index) as Context;
		this.navTo("freightInvoicesDetail", { id: ctx.getProperty("Key") as string });
	}

	async onOpenBatch(): Promise<void> {
		const branch = await this.getBranchInfo();
		this.batch().setData({ BranchCode: branch?.code ?? "", From: "", To: "", TakerCardCode: "", TakerName: "", Issue: false } as BatchForm);
		this.batchDialog ??= await this.loadFragment({ name: "siagrob1.view.freightInvoices.fragments.BatchDialog" }) as Dialog;
		this.batchDialog.open();
	}

	async onBatchPickTaker(): Promise<void> {
		const ctx = await DialogHelper.openTableSelectDialog(this, "BusinessPartnersSelectDialog", ["CardCode", "CardName", "CardFName"]);
		if (ctx) {
			this.batch().setProperty("/TakerCardCode", ctx.getProperty("CardCode"));
			this.batch().setProperty("/TakerName", ctx.getProperty("CardName"));
		}
	}

	onBatchClearTaker(): void {
		this.batch().setProperty("/TakerCardCode", "");
		this.batch().setProperty("/TakerName", "");
	}

	onBatchClose(): void {
		this.batchDialog?.close();
	}

	async onBatchRun(): Promise<void> {
		const b = this.batch().getData() as BatchForm;
		if (!b.BranchCode) {
			MessageBox.error("Escolha a filial da sessão.");
			return;
		}
		if (!b.From || !b.To || b.To < b.From) {
			MessageBox.error("Informe o período (De e Até).");
			return;
		}
		this.batchDialog.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.freightInvoicesBatchCreate, buildFreightInvoiceBatchPayload(b));
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const r = odataValue<{ Created: string[]; Errors: string[] }>(result.data) ?? { Created: [], Errors: [] };
			this.batchDialog.close();
			this.binding()?.refresh();
			const head = `${r.Created?.length ?? 0} fatura(s) gerada(s).`;
			if (r.Errors?.length) {
				MessageBox.warning(`${head}\n\n${r.Errors.join("\n")}`);
			} else {
				MessageBox.success(head);
			}
		} finally {
			this.batchDialog.setBusy(false);
		}
	}
}
