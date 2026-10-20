import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { EdmType } from "sap/ui/export/library";
import CommonController from "siagrob1/controller/common/CommonController";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";

type TabKey = "documents" | "summary" | "assessment" | "r2055" | "issues";

type Column = { label: string; property: string; type?: EdmType; width?: number };

type ConferenceData = {
	documents: Record<string, unknown>[];
	summary: Record<string, unknown>[];
	assessment: Record<string, unknown>[];
	assessmentTotals: { debits: number; credits: number; balance: number };
	r2055: Record<string, unknown>[];
	issues: Record<string, unknown>[];
};

const money = (label: string, property: string): Column => ({ label, property, type: EdmType.Number });
const date = (label: string, property: string): Column => ({ label, property, type: EdmType.Date });
const text = (label: string, property: string, width?: number): Column => ({ label, property, width });

/** Colunas e nome da planilha de cada aba; as propriedades são as do JSON do backend (camelCase). */
const SHEETS: Record<TabKey, { sheetName: string; columns: Column[] }> = {
	documents: {
		sheetName: "Documentos",
		columns: [
			text("Direção", "direction"), date("Data", "date"), text("Modelo", "model"), text("Série", "series"),
			text("Número", "number"), text("Nº interno", "internalNumber"), text("Chave de acesso", "accessKey", 46),
			text("Parceiro", "partner", 30), text("Produto", "itemCode"), text("Descrição", "itemName", 30),
			text("CFOP", "cfop"), text("CST ICMS", "cstIcms"), money("Valor operação", "operationValue"),
			money("Base ICMS", "icmsBase"), money("Alíq. ICMS", "icmsRate"), money("ICMS", "icmsValue"),
			text("CST PIS", "cstPis"), money("PIS", "pisValue"), text("CST COFINS", "cstCofins"),
			money("COFINS", "cofinsValue"), text("Tipo", "documentType"),
		],
	},
	summary: {
		sheetName: "Resumo CST-CFOP",
		columns: [
			text("Direção", "direction"), text("CST ICMS", "cstIcms"), text("CFOP", "cfop"),
			money("Alíq. ICMS", "icmsRate"), money("Valor operação", "operationValue"),
			money("Base ICMS", "icmsBase"), money("ICMS", "icmsValue"),
		],
	},
	assessment: {
		sheetName: "Apuração ICMS",
		columns: [
			text("CFOP", "cfop"), money("Valor operação", "operationValue"),
			money("Débito (saídas)", "debit"), money("Crédito (entradas)", "credit"),
		],
	},
	r2055: {
		sheetName: "R-2055",
		columns: [
			text("Código", "cardCode"), text("Produtor", "cardName", 30), text("CPF/CNPJ", "taxId", 18),
			text("Enquadramento", "producerType", 20), money("Base", "base"), money("INSS", "inss"),
			money("RAT", "rat"), money("SENAR", "senar"), money("Total", "total"),
		],
	},
	issues: {
		sheetName: "Inconsistências",
		columns: [
			text("Direção", "direction"), date("Data", "date"), text("Número", "number"),
			text("Nº interno", "internalNumber"), text("Parceiro", "partner", 30), text("Produto", "itemCode"),
			text("Inconsistência", "rule", 60),
		],
	},
};

/**
 * Conferência Fiscal: documentos escriturados do mês (entrada e saída), resumo por CST/CFOP, apuração do ICMS,
 * prévia do R-2055 e inconsistências, para conferir antes de gerar o SPED. Uma consulta alimenta as cinco abas.
 * @namespace siagrob1.controller.fiscalConference
 */
export default class Main extends CommonController {
	onInit(): void {
		this.getView().setModel(new JSONModel({ BranchCode: "", BranchName: "", Month: Main.previousMonth() }), "params");
		this.getView().setModel(new JSONModel(Main.emptyResult()), "conference");
	}

	private static emptyResult(): ConferenceData {
		return {
			documents: [], summary: [], assessment: [], assessmentTotals: { debits: 0, credits: 0, balance: 0 },
			r2055: [], issues: [],
		};
	}

	/** Primeiro dia do mês anterior (yyyy-MM-dd) — a conferência costuma ser do mês fechado. */
	private static previousMonth(): string {
		const now = new Date();
		return localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
	}

	async onSearch(): Promise<void> {
		const params = (this.getModel("params") as JSONModel).getData() as { BranchCode: string; Month: string };
		if (!params.Month) {
			MessageBox.warning("Informe o mês.");
			return;
		}

		const [year, month] = params.Month.split("-").map(Number);

		try {
			this.setBusy(true);
			const response = await fetch(this.api.fiscalConference, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ branchCode: params.BranchCode || null, year, month }),
			});

			if (!response.ok) {
				MessageBox.error((await response.text()) || "Falha ao consultar a conferência fiscal.");
				return;
			}

			(this.getModel("conference") as JSONModel).setData({
				...Main.emptyResult(),
				...(await response.json() as Partial<ConferenceData>),
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}

	onExport(tab: TabKey): void {
		const sheetDef = SHEETS[tab];
		const rows = ((this.getModel("conference") as JSONModel).getProperty(`/${tab}`) as Record<string, unknown>[]) ?? [];
		const dateColumns = sheetDef.columns.filter((c) => c.type === EdmType.Date).map((c) => c.property);

		// O JSON traz datas ISO em texto; a planilha precisa de Date para formatar como data.
		const data = rows.map((row) => {
			const copy = { ...row };
			for (const property of dateColumns) {
				if (copy[property]) copy[property] = new Date(copy[property] as string);
			}
			return copy;
		});

		const month = ((this.getModel("params") as JSONModel).getProperty("/Month") as string)?.slice(0, 7) ?? "";
		const sheet = new Spreadsheet({
			dataSource: data,
			fileName: `ConferenciaFiscal-${sheetDef.sheetName.replace(/\s+/g, "")}-${month}.xlsx`,
			workbook: {
				context: { sheetName: sheetDef.sheetName },
				columns: sheetDef.columns.map((c) => ({
					label: c.label,
					property: c.property,
					type: c.type,
					width: c.width,
					...(c.type === EdmType.Date ? { format: "dd/mm/yyyy" } : {}),
					...(c.type === EdmType.Number ? { scale: 2, delimiter: true } : {}),
				})),
			},
		});
		void sheet.build().finally(() => sheet.destroy());
	}
}
