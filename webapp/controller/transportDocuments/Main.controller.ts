import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { downloadPostedFile } from "siagrob1/helpers/DownloadHelpers";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
	TransportDocumentsFilter, batchSelectionError, buildTransportDocumentsFilter, cteActions, endorsementStatusState, endorsementStatusText, cteStatusState, cteStatusText,
	formatAccessKey, partyNameByRole, takerName,
} from "siagrob1/helpers/CteHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import BaseController from "../BaseController";

type Parties = { Role: string; Name?: string }[];

/**
 * Lista de CT-e (só STANDALONE). Filtros vão como $filter cru: Status é enum e os participantes
 * ficam na coleção Parties.
 * @namespace siagrob1.controller.transportDocuments
 */
export default class Main extends BaseController {
	cteStatusText = cteStatusText;
	cteStatusState = cteStatusState;
	formatAccessKey = formatAccessKey;
	endorsementStatusText = endorsementStatusText;
	endorsementStatusState = endorsementStatusState;
	takerName = (parties: Parties, takerRole: number) => takerName(parties, takerRole);
	senderName = (parties: Parties) => partyNameByRole(parties, "Sender");
	recipientName = (parties: Parties) => partyNameByRole(parties, "Recipient");

	onInit(): void {
		this.getView().setModel(new JSONModel({}), "filter");
		this.getRouter().getRoute("transportDocuments").attachPatternMatched(() => {
			void this.refreshStandaloneFlag();
			this.applyFilters();
		});
	}

	private binding(): ODataListBinding {
		return this.byId("tableTransportDocuments").getBinding("rows") as ODataListBinding;
	}

	private applyFilters(): void {
		const filter = (this.getView().getModel("filter") as JSONModel).getData() as TransportDocumentsFilter;
		this.binding()?.changeParameters({ $filter: buildTransportDocumentsFilter(filter) });
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

	onCreate(): void {
		this.navTo("transportDocumentsNew");
	}

	private selected(action: string): Context {
		const table = this.byId("tableTransportDocuments") as Table;
		const indices = table.getSelectedIndices();
		if (indices.length !== 1) {
			MessageBox.alert(`Selecione um único CT-e para ${action}.`);
			return null;
		}
		return table.getContextByIndex(indices[0]) as Context;
	}

	onDetail(): void {
		const context = this.selected("visualizar");
		if (context) {
			this.navTo("transportDocumentsDetail", { id: context.getProperty("Key") as string });
		}
	}

	onEdit(): void {
		const context = this.selected("editar");
		if (!context) {
			return;
		}
		if (!cteActions(context.getProperty("Status") as string, context.getProperty("Number") as number).edit) {
			MessageBox.alert("Só é possível alterar CT-e em rascunho ou rejeitado.");
			return;
		}
		this.navTo("transportDocumentsEdit", { id: context.getProperty("Key") as string });
	}

	async onDelete(): Promise<void> {
		const context = this.selected("excluir");
		if (!context || !(await confirmDialog("Deseja realmente excluir este CT-e?", "Excluir CT-e?"))) {
			return;
		}
		this.setBusy(true);
		try {
			const result = await sendJson("POST", ServerRoutes.transportDocumentsDelete, { Key: context.getProperty("Key") as string });
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			MessageToast.show("CT-e excluído.");
			this.onRefresh();
		} finally {
			this.setBusy(false);
		}
	}

	/** Chaves das linhas marcadas, ou null (com aviso) fora de 1 a 200. */
	private selectedKeys(): string[] {
		const table = this.byId("tableTransportDocuments") as Table;
		const keys = table.getSelectedIndices()
			.map((i) => table.getContextByIndex(i)?.getProperty("Key") as string)
			.filter(Boolean);
		const error = batchSelectionError(keys.length);
		if (error) {
			MessageBox.alert(error);
			return null;
		}
		return keys;
	}

	/** Lote pelo Hangfire: o servidor devolve quantos foram enfileirados; o resultado fica em cada CT-e. */
	private async runBatch(url: string, verb: string): Promise<void> {
		const keys = this.selectedKeys();
		if (!keys || !(await confirmDialog(`${verb} ${keys.length} CT-e em segundo plano?`, `${verb} selecionados?`))) {
			return;
		}
		this.setBusy(true);
		try {
			const result = await sendJson("POST", url, { Keys: keys });
			if (!result.ok) {
				MessageBox.error(result.message);
				return;
			}
			const count = odataValue<number>(result.data);
			MessageBox.information(`${count} CT-e enfileirado(s). Atualize a lista para acompanhar a situação de cada um.`);
		} finally {
			this.setBusy(false);
		}
	}

	async onTransmitBatch(): Promise<void> {
		await this.runBatch(ServerRoutes.transportDocumentsTransmitBatch, "Transmitir");
	}

	async onEndorseBatch(): Promise<void> {
		await this.runBatch(ServerRoutes.transportDocumentsEndorseBatch, "Averbar");
	}

	/** POST que devolve um ZIP (downloadPostedFile). */
	private async downloadZip(url: string, fileName: string): Promise<void> {
		const keys = this.selectedKeys();
		if (!keys) {
			return;
		}
		this.setBusy(true);
		try {
			await downloadPostedFile(url, { Keys: keys }, fileName);
		} finally {
			this.setBusy(false);
		}
	}

	async onDownloadXmlBatch(): Promise<void> {
		await this.downloadZip(ServerRoutes.transportDocumentsXmlBatch, "xml-cte.zip");
	}

	async onDownloadDacteBatch(): Promise<void> {
		await this.downloadZip(ServerRoutes.dacteBatchReport, "dacte-cte.zip");
	}
}
