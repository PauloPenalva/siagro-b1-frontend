import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import CommonController from "siagrob1/controller/common/CommonController";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";

type Params = {
	/** yyyy-MM-dd */
	StartDate: string;
	/** yyyy-MM-dd */
	EndDate: string;
	/** Vazio = todas as filiais. */
	BranchCode: string;
	BranchName: string;
	IncludeDanfe: boolean;
	IncludeReceived: boolean;
};

/**
 * Exportação para o contador: baixa um ZIP com os XMLs (autorizados, cancelamentos, CC-e, inutilizações),
 * os DANFEs e os XMLs de terceiros do período. Só STANDALONE.
 * @namespace siagrob1.controller.nfeExport
 */
export default class Main extends CommonController {
	onInit(): void {
		// Padrão: o mês anterior inteiro, que é o que o contador pede no fechamento.
		const now = new Date();
		this.getView().setModel(
			new JSONModel({
				StartDate: localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
				EndDate: localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
				BranchCode: "",
				BranchName: "",
				IncludeDanfe: true,
				IncludeReceived: true,
			} as Params),
			"params",
		);
	}

	onClearBranch(): void {
		const model = this.getModel("params") as JSONModel;
		model.setProperty("/BranchCode", "");
		model.setProperty("/BranchName", "");
	}

	async onGenerate(): Promise<void> {
		const params = (this.getModel("params") as JSONModel).getData() as Params;
		if (!params.StartDate || !params.EndDate) {
			MessageBox.warning("Informe a data inicial e a final.");
			return;
		}
		if (params.StartDate > params.EndDate) {
			MessageBox.warning("A data inicial deve ser anterior ou igual à final.");
			return;
		}

		this.setBusy(true);
		try {
			const response = await fetch(this.api.nfeExport, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					startDate: params.StartDate,
					endDate: params.EndDate,
					branchCode: params.BranchCode || null,
					includeDanfe: params.IncludeDanfe,
					includeReceived: params.IncludeReceived,
				}),
			});
			if (!response.ok) {
				MessageBox.error((await readErrorMessage(response)) || `Erro ${response.status} ao comunicar com o servidor.`);
				return;
			}

			const link = document.createElement("a");
			link.href = URL.createObjectURL(await response.blob());
			link.download = Main.fileNameFrom(response.headers.get("Content-Disposition")) ?? "NFe.zip";
			link.click();
			setTimeout(() => URL.revokeObjectURL(link.href), 60000);
			MessageToast.show("Arquivo gerado.");
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}

	/** Nome sugerido pelo backend (`filename*=UTF-8''...` ou `filename=`). */
	private static fileNameFrom(header: string): string {
		if (!header) return null;
		const encoded = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
		if (encoded) {
			try {
				return decodeURIComponent(encoded[1].trim());
			} catch {
				// cai para o filename simples
			}
		}
		const plain = /filename="?([^";]+)"?/i.exec(header);
		return plain ? plain[1].trim() : null;
	}
}
