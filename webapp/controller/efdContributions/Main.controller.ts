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
	/** "0" original, "1" retificadora. */
	Purpose: string;
	PreviousReceiptNumber: string;
};

type Totals = {
	pisDue: number;
	pisCredit: number;
	pisPayable: number;
	cofinsDue: number;
	cofinsCredit: number;
	cofinsPayable: number;
};

type CheckResult = {
	issues: { blocking: boolean; message: string; reference: string }[];
	totals: Totals;
	/** true só enquanto a verificação corresponde aos parâmetros atuais; qualquer mudança zera. */
	checked: boolean;
	/** JSON do pedido verificado; o arquivo só sai se o pedido atual for idêntico. */
	checkedKey?: string;
	blockingCount: number;
	warningCount: number;
};

/**
 * EFD Contribuições (PIS/COFINS): "Verificar" mostra as inconsistências e os totais da apuração; "Gerar arquivo"
 * baixa o TXT e só fica disponível sem inconsistência bloqueante e para o pedido verificado. Só STANDALONE.
 * @namespace siagrob1.controller.efdContributions
 */
export default class Main extends CommonController {
	onInit(): void {
		const now = new Date();
		const paramsModel = new JSONModel({
			BranchCode: "",
			BranchName: "",
			Month: localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
			Purpose: "0",
			PreviousReceiptNumber: "",
		} as Params);
		// O value help da filial usa setValue, que não dispara `change`: o modelo é quem enxerga toda mudança.
		paramsModel.attachPropertyChange(() => this.onParamsChanged());
		this.getView().setModel(paramsModel, "params");
		this.getView().setModel(new JSONModel(Main.emptyResult()), "check");
	}

	private static emptyResult(): CheckResult {
		return {
			issues: [],
			totals: { pisDue: 0, pisCredit: 0, pisPayable: 0, cofinsDue: 0, cofinsCredit: 0, cofinsPayable: 0 },
			checked: false,
			blockingCount: 0,
			warningCount: 0,
		};
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
		const receipt = (params.PreviousReceiptNumber ?? "").trim();
		if (params.Purpose === "1" && !receipt) {
			MessageBox.warning("Informe o número do recibo anterior da retificadora.");
			return null;
		}

		const [year, month] = params.Month.split("-").map(Number);
		return {
			branchCode: params.BranchCode,
			year,
			month,
			purpose: Number(params.Purpose),
			previousReceiptNumber: params.Purpose === "1" ? receipt : null,
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
			const response = await this.post(`${this.api.efdContributions}/Check`, request);
			if (!response) return;

			const data = (await response.json()) as Pick<CheckResult, "issues" | "totals">;
			const issues = data.issues ?? [];
			(this.getModel("check") as JSONModel).setData({
				issues,
				totals: data.totals ?? Main.emptyResult().totals,
				checked: true,
				checkedKey: JSON.stringify(request),
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

		const checkModel = this.getModel("check") as JSONModel;
		if (!(checkModel.getProperty("/checked") as boolean) || JSON.stringify(request) !== (checkModel.getProperty("/checkedKey") as string)) {
			MessageBox.warning("Os parâmetros mudaram desde a última verificação. Clique em Verificar novamente.");
			return;
		}

		this.setBusy(true);
		try {
			const response = await this.post(this.api.efdContributions, request);
			if (!response) return;

			const month = ((this.getModel("params") as JSONModel).getProperty("/Month") as string).slice(0, 7);
			const link = document.createElement("a");
			link.href = URL.createObjectURL(await response.blob());
			link.download = Main.fileNameFrom(response.headers.get("Content-Disposition")) ?? `EfdContribuicoes-${month}.txt`;
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
