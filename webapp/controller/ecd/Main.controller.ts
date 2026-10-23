import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import CommonController from "siagrob1/controller/common/CommonController";
import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";

type Params = {
	BranchCode: string;
	BranchName: string;
	Year: number;
	/** Finalidade: "0" original, "1" substituta. */
	Purpose: string;
	ReplacedBookHash: string;
};

type CheckResult = {
	issues: { blocking: boolean; message: string; reference: string }[];
	totals: { totalDebit: number; totalCredit: number; netIncome: number };
	/** true só enquanto a verificação corresponde aos parâmetros atuais; qualquer mudança zera. */
	checked: boolean;
	/** JSON do pedido verificado; o arquivo só sai se o pedido atual for idêntico. */
	checkedKey?: string;
	blockingCount: number;
	warningCount: number;
};

/**
 * ECD (SPED Contábil): "Verificar" mostra as inconsistências e os totais do ano; "Gerar arquivo" baixa o TXT
 * e fica desligado enquanto houver inconsistência bloqueante. Só STANDALONE.
 * @namespace siagrob1.controller.ecd
 */
export default class Main extends CommonController {
	onInit(): void {
		const paramsModel = new JSONModel({
			BranchCode: "",
			BranchName: "",
			Year: new Date().getFullYear() - 1,
			Purpose: "0",
			ReplacedBookHash: "",
		} as Params);
		// O value help da filial usa setValue, que não dispara `change`: o modelo é quem enxerga toda mudança.
		paramsModel.attachPropertyChange(() => this.onParamsChanged());
		this.getView().setModel(paramsModel, "params");
		this.getView().setModel(new JSONModel(Main.emptyResult()), "check");
	}

	private static emptyResult(): CheckResult {
		return {
			issues: [],
			totals: { totalDebit: 0, totalCredit: 0, netIncome: 0 },
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
		const year = Number(params.Year);
		if (!Number.isInteger(year) || year < 2000 || year > 9999) {
			MessageBox.warning("Informe um ano válido.");
			return null;
		}
		const substitute = params.Purpose === "1";
		const hash = (params.ReplacedBookHash ?? "").trim();
		if (substitute && !hash) {
			MessageBox.warning("Informe o hash do livro substituído.");
			return null;
		}
		return {
			branchCode: params.BranchCode,
			year,
			purpose: Number(params.Purpose),
			replacedBookHash: substitute ? hash : null,
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
			const response = await this.post(`${this.api.ecd}/Check`, request);
			if (!response) return;

			const data = (await response.json()) as Pick<CheckResult, "issues" | "totals">;
			const issues = data.issues ?? [];
			(this.getModel("check") as JSONModel).setData({
				issues,
				totals: data.totals ?? { totalDebit: 0, totalCredit: 0, netIncome: 0 },
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
			const response = await this.post(this.api.ecd, request);
			if (!response) return;

			const year = (this.getModel("params") as JSONModel).getProperty("/Year") as number;
			const link = document.createElement("a");
			link.href = URL.createObjectURL(await response.blob());
			link.download = Main.fileNameFrom(response.headers.get("Content-Disposition")) ?? `Ecd-${year}.txt`;
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
