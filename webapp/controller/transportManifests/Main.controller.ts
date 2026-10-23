import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/m/Table";
import Fragment from "sap/ui/core/Fragment";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import GridTable from "sap/ui/table/Table";
import { openAttachmentViewer } from "siagrob1/dialogs/AttachmentViewer";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { odataCollection, odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
	EligibleCteFilter, MDFE_STATUSES, TransportManifestsFilter, buildTransportManifestsFilter, endorsementState, endorsementText, filterEligibleCtes,
	formatAccessKey, notEndorsedMessage,
	mdfeActions, mdfeStatusState, mdfeStatusText, weightUnitText,
} from "siagrob1/helpers/MdfeHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import BaseController from "../BaseController";

const SELECT_CTES_FRAGMENT = "siagrob1.view.transportManifests.fragments.SelectCtesDialog";

type EligibleCte = { Key: string; Number?: number; TractionPlate?: string; IssuedAt?: string; EndorsementStatus?: string };

/**
 * Lista de MDF-e (só STANDALONE). Filtros vão como $filter cru (Status é enum). A inclusão parte dos
 * CT-e autorizados fora de manifesto ativo (MdfeEligibleCtes) e cria o rascunho no servidor.
 * @namespace siagrob1.controller.transportManifests
 */
export default class Main extends BaseController {
	mdfeStatusText = mdfeStatusText;
	mdfeStatusState = mdfeStatusState;
	formatAccessKey = formatAccessKey;
	endorsementText = endorsementText;
	endorsementState = endorsementState;
	weightText = (weight: number, unit: string) =>
		weight === null || weight === undefined ? "" : `${Number(weight).toLocaleString("pt-BR")} ${weightUnitText(unit)}`;

	private selectDialog: Dialog;
	private eligibleAll: EligibleCte[] = [];
	private branchCode = "";

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "filter");
		this.getView().setModel(new JSONModel(MDFE_STATUSES), "statuses");
		this.getView().setModel(new JSONModel({ rows: [], filter: {} }), "eligible");
		this.getRouter().getRoute("transportManifests").attachPatternMatched(() => {
			void this.refreshStandaloneFlag();
			this.applyFilters();
		});
	}

	private binding(): ODataListBinding {
		return this.byId("tableTransportManifests").getBinding("rows") as ODataListBinding;
	}

	private applyFilters(): void {
		const filter = (this.getView().getModel("filter") as JSONModel).getData() as TransportManifestsFilter;
		this.binding()?.changeParameters({ $filter: buildTransportManifestsFilter(filter) });
	}

	onSearch(): void {
		this.applyFilters();
	}

	onClearFilters(): void {
		(this.getView().getModel("filter") as JSONModel).setData({});
		this.applyFilters();
	}

	onRefresh(): void {
		this.binding()?.refresh();
	}

	private selected(action: string): Context {
		const table = this.byId("tableTransportManifests") as GridTable;
		const indices = table.getSelectedIndices();
		if (indices.length !== 1) {
			MessageBox.alert(`Selecione um MDF-e para ${action}.`);
			return null;
		}
		return table.getContextByIndex(indices[0]) as Context;
	}

	onDetail(): void {
		const context = this.selected("visualizar");
		if (context) {
			this.navTo("transportManifestsDetail", { id: context.getProperty("Key") as string });
		}
	}

	async onDamdfe(): Promise<void> {
		const context = this.selected("baixar o DAMDFE");
		if (!context) {
			return;
		}
		if (!mdfeActions(context.getProperty("Status") as string, context.getProperty("Number") as number).damdfe) {
			MessageBox.alert("O DAMDFE só existe para MDF-e autorizado, encerrado ou cancelado.");
			return;
		}
		const key = context.getProperty("Key") as string;
		await openAttachmentViewer({
			url: `${ServerRoutes.damdfeReport}/${key}`,
			method: "GET",
			errorMessage: "Falha ao gerar o DAMDFE.",
			title: `DAMDFE – MDF-e nº ${context.getProperty("Number") as number} série ${context.getProperty("Series") as number}`,
			fileName: `${context.getProperty("AccessKey") as string}-damdfe.pdf`,
		});
	}

	// ---------- inclusão ----------

	private eligible(): JSONModel {
		return this.getView().getModel("eligible") as JSONModel;
	}

	private eligibleTable(): Table {
		return Fragment.byId(`${this.getView().getId()}_${SELECT_CTES_FRAGMENT}`, "mdfeEligibleCtesTable") as Table;
	}

	async onCreate(): Promise<void> {
		const branch = await this.getBranchInfo();
		this.branchCode = branch?.code ?? "";
		if (!this.branchCode) {
			MessageBox.error("Escolha a filial da sessão antes de incluir o MDF-e.");
			return;
		}
		this.setBusy(true);
		try {
			const result = await sendJson("GET", `${ServerRoutes.mdfeEligibleCtes}(BranchCode='${encodeURIComponent(this.branchCode.replace(/'/g, "''"))}')`);
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			this.eligibleAll = odataCollection<EligibleCte>(result.data);
		} finally {
			this.setBusy(false);
		}
		this.eligible().setData({ rows: this.eligibleAll, filter: {} });
		this.selectDialog ??= await DialogHelper.createDialog(this, SELECT_CTES_FRAGMENT);
		this.eligibleTable()?.removeSelections(true);
		this.selectDialog.open();
	}

	onFilterEligible(): void {
		this.eligibleTable()?.removeSelections(true);
		this.eligible().setProperty("/rows", filterEligibleCtes(this.eligibleAll, this.eligible().getProperty("/filter") as EligibleCteFilter));
	}

	onCloseSelectCtes(): void {
		this.selectDialog?.close();
	}

	async onConfirmSelectCtes(): Promise<void> {
		const rows = (this.eligibleTable()?.getSelectedContexts(true) ?? []).map((c) => c.getObject() as EligibleCte);
		const keys = rows.map((r) => r.Key).filter(Boolean);
		if (keys.length === 0) {
			MessageBox.alert("Selecione ao menos um CT-e.");
			return;
		}
		// Sem averbação a SEFAZ rejeita o MDF-e (699); o servidor também recusa.
		const missing = notEndorsedMessage(rows);
		if (missing) {
			MessageBox.warning(missing);
			return;
		}
		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.transportManifestsCreateFromCtes, { BranchCode: this.branchCode, CteKeys: keys });
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			this.selectDialog.close();
			this.navTo("transportManifestsEdit", { id: odataValue<string>(result.data) });
		} finally {
			this.setBusy(false);
		}
	}
}
