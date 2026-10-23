import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import CommonController from "siagrob1/controller/common/CommonController";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";

type Params = {
	BranchCode: string;
	BranchName: string;
	/** Primeiro dia do mês (yyyy-MM-dd); o DatePicker mostra só MM/yyyy. */
	Month: string;
	/** COD_FIN do 0000: "0" original, "1" retificadora. */
	Purpose: string;
	IncludeInventory: boolean;
	InventoryDate: string;
	InventoryReason: string;
	PreviousCreditBalance: number;
};

type CheckResult = {
	issues: { blocking: boolean; message: string; reference: string }[];
	totals: { debits: number; credits: number; balance: number };
	/** true só enquanto a verificação corresponde aos parâmetros atuais; qualquer mudança zera. */
	checked: boolean;
	blockingCount: number;
	warningCount: number;
};

/**
 * SPED Fiscal (EFD ICMS/IPI): "Verificar" mostra as inconsistências e os totais da apuração; "Gerar arquivo"
 * baixa o TXT e fica desligado enquanto houver inconsistência bloqueante. Só STANDALONE.
 * @namespace siagrob1.controller.spedFiscal
 */
export default class Main extends CommonController {
	onInit(): void {
		const now = new Date();
		this.getView().setModel(new JSONModel({
			BranchCode: "",
			BranchName: "",
			Month: localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
			Purpose: "0",
			IncludeInventory: false,
			InventoryDate: null,
			InventoryReason: "01",
			PreviousCreditBalance: 0,
		} as Params), "params");
		this.getView().setModel(new JSONModel(Main.emptyResult()), "check");
	}

	private static emptyResult(): CheckResult {
		return { issues: [], totals: { debits: 0, credits: 0, balance: 0 }, checked: false, blockingCount: 0, warningCount: 0 };
	}

	/** Qualquer mudança nos parâmetros invalida a verificação anterior: o arquivo só sai de uma verificação atual. */
	onParamsChanged(): void {
		(this.getModel("check") as JSONModel).setData(Main.emptyResult());
	}

	private buildRequest(): object {
		const params = (this.getModel("params") as JSONModel).getData() as Params;
		if (!params.BranchCode) {
			MessageBox.warning("Informe a filial.");
			return null;
		}
		if (!params.Month) {
			MessageBox.warning("Informe o mês.");
			return null;
		}

		const [year, month] = params.Month.split("-").map(Number);
		return {
			branchCode: params.BranchCode,
			year,
			month,
			purpose: Number(params.Purpose),
			includeInventory: params.IncludeInventory,
			inventoryDate: params.IncludeInventory && params.InventoryDate ? params.InventoryDate : null,
			inventoryReason: params.InventoryReason || "01",
			previousCreditBalance: Number(params.PreviousCreditBalance) || 0,
		};
	}

	private async post(url: string, body: object): Promise<Response> {
		try {
			const response = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!response.ok) {
				MessageBox.error((await readErrorMessage(response)) || `Erro ${response.status} ao comunicar com o servidor.`);
				return null;
			}
			return response;
		} catch (error) {
			MessageBox.error((error as Error).message);
			return null;
		}
	}

	async onCheck(): Promise<void> {
		const request = this.buildRequest();
		if (!request) return;

		this.setBusy(true);
		try {
			const response = await this.post(`${this.api.spedFiscal}/Check`, request);
			if (!response) return;

			const data = (await response.json()) as Pick<CheckResult, "issues" | "totals">;
			const issues = data.issues ?? [];
			(this.getModel("check") as JSONModel).setData({
				issues,
				totals: data.totals ?? { debits: 0, credits: 0, balance: 0 },
				checked: true,
				blockingCount: issues.filter((i) => i.blocking).length,
				warningCount: issues.filter((i) => !i.blocking).length,
			} as CheckResult);
		} finally {
			this.setBusy(false);
		}
	}

	async onGenerate(): Promise<void> {
		const request = this.buildRequest();
		if (!request) return;

		this.setBusy(true);
		try {
			const response = await this.post(this.api.spedFiscal, request);
			if (!response) return;

			const month = ((this.getModel("params") as JSONModel).getProperty("/Month") as string).slice(0, 7);
			const link = document.createElement("a");
			link.href = URL.createObjectURL(await response.blob());
			link.download = Main.fileNameFrom(response.headers.get("Content-Disposition")) ?? `SpedFiscal-${month}.txt`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(link.href), 60000);
			MessageToast.show("Arquivo gerado.");
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
