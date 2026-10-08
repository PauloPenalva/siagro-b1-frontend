import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import CommonController from "siagrob1/controller/common/CommonController";

/**
 * Base das telas dos relatórios de documentos fiscais: filtros num JSONModel `params`,
 * situação padrão sem Cancelado e impressão via POST que abre o PDF em nova aba.
 * `ui>/standalone` esconde o filtro de Situação NF-e em SAPB1 (lá a NF-e não sai do Siagro).
 * @namespace siagrob1.controller.reports
 */
export default abstract class InvoiceReportController extends CommonController {

	protected abstract readonly routeName: string;
	protected abstract readonly formId: string;
	protected abstract readonly serverRoute: string;

	onInit(): void {
		this.getView().setModel(new JSONModel(), "params");
		if (!this.getView().getModel("ui")) {
			this.getView().setModel(new JSONModel({ standalone: false }), "ui");
		}

		this.getRouter()
			.getRoute(this.routeName)
			.attachPatternMatched(() => this.routeMatched());
	}

	/** Valores iniciais dos filtros próprios da tela, além dos comuns. */
	protected defaults(): Record<string, unknown> {
		return {};
	}

	private routeMatched() {
		this.clearStates(this.formId);
		(this.getModel("params") as JSONModel).setData({
			// InvoiceStatus: 0 Pendente, 1 Confirmado, 3 Retornado (2 = Cancelado fica de fora).
			// Strings: as chaves dos itens do MultiComboBox são strings; buildPayload converte.
			Statuses: ["0", "1", "3"],
			NfeStatuses: [],
			...this.defaults(),
		});
		void this.refreshStandaloneFlag();
	}

	async onPrintReport() {
		if (!this.validateForm(this.formId)) {
			MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
			return;
		}

		const payload = this.buildPayload();

		try {
			this.setBusy(true);

			const response = await fetch(this.serverRoute, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const message = await response.text();
				throw new Error(message || "Falha ao gerar relatório.");
			}

			const fileURL = URL.createObjectURL(await response.blob());
			window.open(fileURL, "_blank");
			setTimeout(() => URL.revokeObjectURL(fileURL), 60000);
		} catch (error) {
			MessageBox.error((error as Error)?.message);
		} finally {
			this.setBusy(false);
		}
	}

	/**
	 * MultiComboBox devolve as chaves como string; o backend espera os números dos enums.
	 * Campos vazios viram null para não filtrarem nada.
	 */
	protected buildPayload(): Record<string, unknown> {
		const data = { ...(this.getModel("params") as JSONModel).getData() } as Record<string, unknown>;
		data.Statuses = ((data.Statuses as unknown[]) ?? []).map(Number);
		data.NfeStatuses = ((data.NfeStatuses as unknown[]) ?? []).map(Number);
		for (const key of Object.keys(data)) {
			if (data[key] === "") data[key] = null;
		}
		return data;
	}
}
