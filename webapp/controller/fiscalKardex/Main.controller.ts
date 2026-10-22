import Button from "sap/m/Button";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import Label from "sap/m/Label";
import MessageBox from "sap/m/MessageBox";
import VBox from "sap/m/VBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { EdmType } from "sap/ui/export/library";
import CommonController from "siagrob1/controller/common/CommonController";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";

type RowType = "opening" | "line" | "closing";

/** Uma linha da grade achatada: cabeçalho de saldo anterior, movimento ou saldo final de um produto. */
type KardexRow = {
	rowType: RowType;
	itemCode: string;
	itemName: string;
	unitOfMeasureCode: string;
	date: string | Date;
	direction: string;
	kind: string;
	internalNumber: string;
	documentNumber: string;
	partner: string;
	cfop: string;
	usageName: string;
	quantityIn: number;
	quantityOut: number;
	unitCost: number;
	valueIn: number;
	valueOut: number;
	balanceQuantity: number;
	balanceValue: number;
	invoiceValue: number;
	warning: string;
};

type KardexLine = Partial<KardexRow> & { date: string };

type KardexItem = {
	itemCode: string;
	itemName: string;
	unitOfMeasureCode?: string;
	openingQuantity: number;
	openingValue: number;
	lines: KardexLine[];
	closingQuantity: number;
	closingValue: number;
};

type Column = { label: string; property: keyof KardexRow; type?: EdmType; scale?: number; width?: number };

const text = (label: string, property: keyof KardexRow, width?: number): Column => ({ label, property, width });
const qty = (label: string, property: keyof KardexRow): Column => ({ label, property, type: EdmType.Number, scale: 3 });
const money = (label: string, property: keyof KardexRow): Column => ({ label, property, type: EdmType.Number, scale: 2 });
const cost = (label: string, property: keyof KardexRow): Column => ({ label, property, type: EdmType.Number, scale: 6 });

/** Colunas da planilha; as propriedades são as da linha achatada (camelCase do backend). */
const COLUMNS: Column[] = [
	text("Produto", "itemCode"), text("Descrição", "itemName", 30), text("UM", "unitOfMeasureCode"),
	{ label: "Data", property: "date", type: EdmType.Date }, text("Dir.", "direction"), text("Tipo", "kind", 24),
	text("Nº interno", "internalNumber"), text("Documento", "documentNumber"), text("Parceiro", "partner", 30),
	text("CFOP", "cfop"), text("Natureza de operação", "usageName", 30),
	qty("Qtd. entrada", "quantityIn"), qty("Qtd. saída", "quantityOut"), cost("Custo unitário", "unitCost"),
	money("Valor entrada", "valueIn"), money("Valor saída", "valueOut"),
	qty("Saldo qtd.", "balanceQuantity"), money("Saldo valor", "balanceValue"),
	money("Valor da nota", "invoiceValue"), text("Alerta", "warning", 40),
];

/**
 * Registro Kardex: movimentação PEPS por produto (entradas, saídas, devoluções e complementos) com saldo anterior e
 * saldo final. O backend devolve itens com linhas; aqui viram uma grade só (cabeçalho "Saldo anterior", movimentos,
 * "Saldo final"), com as linhas de alerta destacadas. "Imprimir livro" gera o Registro de Controle da Produção e do
 * Estoque (modelo 3) da filial, período e produto da tela.
 * @namespace siagrob1.controller.fiscalKardex
 */
export default class Main extends CommonController {
	onInit(): void {
		const now = new Date();
		this.getView().setModel(new JSONModel({
			BranchCode: "", BranchName: "", ItemCode: "",
			FromDate: localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
			ToDate: localIsoDate(now),
		}), "params");
		this.getView().setModel(new JSONModel({ rows: [], searched: false }), "kardex");
		void this.prefillBranch();
	}

	/** Filial de trabalho do usuário como padrão; só preenche se ele ainda não escolheu outra. */
	private async prefillBranch(): Promise<void> {
		const branch = await this.getBranchInfo();
		const params = this.getModel("params") as JSONModel;
		if (branch?.code && !params.getProperty("/BranchCode")) {
			params.setProperty("/BranchCode", branch.code);
			params.setProperty("/BranchName", branch.shortName);
		}
	}

	/** Nulo/zero vira vazio nas linhas de saldo; nos movimentos, 0 aparece como 0. */
	private static flatten(items: KardexItem[], toDate: string): KardexRow[] {
		const rows: KardexRow[] = [];

		for (const item of items) {
			const base = {
				itemCode: item.itemCode, itemName: item.itemName, unitOfMeasureCode: item.unitOfMeasureCode ?? "",
			};
			const empty: Partial<KardexRow> = {
				direction: "", internalNumber: "", documentNumber: "", partner: "", cfop: "", usageName: "",
				quantityIn: null, quantityOut: null, valueIn: null, valueOut: null, invoiceValue: null, warning: "",
			};

			rows.push({
				...base, ...empty, rowType: "opening", date: null, kind: "Saldo anterior",
				unitCost: item.openingQuantity ? item.openingValue / item.openingQuantity : null,
				balanceQuantity: item.openingQuantity, balanceValue: item.openingValue,
			} as KardexRow);

			for (const line of item.lines) {
				rows.push({
					...base, ...empty, ...line, rowType: "line",
					date: line.date, kind: line.kind ?? "", warning: line.warning ?? "",
				} as KardexRow);
			}

			rows.push({
				...base, ...empty, rowType: "closing", date: `${toDate}T00:00:00`, kind: "Saldo final",
				unitCost: item.closingQuantity ? item.closingValue / item.closingQuantity : null,
				balanceQuantity: item.closingQuantity, balanceValue: item.closingValue,
			} as KardexRow);
		}

		return rows;
	}

	async onSearch(): Promise<void> {
		const params = (this.getModel("params") as JSONModel).getData() as {
			BranchCode: string; ItemCode: string; FromDate: string; ToDate: string;
		};

		if (!params.BranchCode) {
			MessageBox.warning("Informe a filial.");
			return;
		}
		if (!params.FromDate || !params.ToDate) {
			MessageBox.warning("Informe o período (De e Até).");
			return;
		}
		if (params.FromDate > params.ToDate) {
			MessageBox.warning("A data inicial não pode ser maior que a final.");
			return;
		}

		try {
			this.setBusy(true);
			const response = await fetch(this.api.fiscalKardex, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					branchCode: params.BranchCode,
					itemCode: params.ItemCode || null,
					fromDate: params.FromDate,
					toDate: params.ToDate,
				}),
			});

			if (!response.ok) {
				MessageBox.error((await response.text()) || "Falha ao consultar o Kardex fiscal.");
				return;
			}

			const data = await response.json() as { items?: KardexItem[] };
			(this.getModel("kardex") as JSONModel).setData({
				rows: Main.flatten(data.items ?? [], params.ToDate),
				searched: true,
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}

	onExport(): void {
		const rows = ((this.getModel("kardex") as JSONModel).getProperty("/rows") as KardexRow[]) ?? [];
		const params = (this.getModel("params") as JSONModel).getData() as { BranchCode: string; FromDate: string; ToDate: string };

		// O JSON traz datas ISO em texto; a planilha precisa de Date para formatar como data.
		const data = rows.map((row) => ({ ...row, date: row.date ? new Date(row.date) : null }));

		const sheet = new Spreadsheet({
			dataSource: data,
			fileName: `KardexFiscal-${params.BranchCode}-${params.FromDate}-${params.ToDate}.xlsx`,
			workbook: {
				context: { sheetName: "Registro Kardex" },
				columns: COLUMNS.map((c) => ({
					label: c.label,
					property: c.property,
					type: c.type,
					width: c.width,
					...(c.type === EdmType.Date ? { format: "dd/mm/yyyy" } : {}),
					...(c.type === EdmType.Number ? { scale: c.scale, delimiter: true } : {}),
				})),
			},
		});
		void sheet.build().finally(() => sheet.destroy());
	}

	/** Pede Nº do livro e folha inicial; o livro sai com a filial, o período e o produto da tela (vazio = todos). */
	onPrintBook(): void {
		const params = (this.getModel("params") as JSONModel).getData() as {
			BranchCode: string; ItemCode: string; FromDate: string; ToDate: string;
		};

		if (!params.BranchCode || !params.FromDate || !params.ToDate) {
			MessageBox.warning("Informe a filial e o período.");
			return;
		}

		const submit = (): void => {
			const bookNumber = parseInt(bookInput.getValue(), 10);
			const firstSheet = parseInt(sheetInput.getValue() || "1", 10);
			if (!(bookNumber >= 1)) {
				bookInput.setValueState("Error").setValueStateText("Informe o número do livro.");
				return;
			}
			if (!(firstSheet >= 1)) {
				sheetInput.setValueState("Error").setValueStateText("A folha inicial deve ser 1 ou mais.");
				return;
			}
			dialog.close();
			void this.printBook(params, bookNumber, firstSheet);
		};
		const bookInput = new Input({ type: "Number", width: "100%", required: true, submit });
		const sheetInput = new Input({ type: "Number", width: "100%", value: "1", submit });
		const dialog: Dialog = new Dialog({
			title: "Imprimir Registro Kardex (modelo 3)",
			contentWidth: "22rem",
			initialFocus: bookInput,
			content: [new VBox({
				renderType: "Bare",
				items: [
					new Label({ text: "Nº do livro", required: true, labelFor: bookInput.getId() }), bookInput,
					new Label({ text: "Folha inicial", labelFor: sheetInput.getId() }).addStyleClass("sapUiSmallMarginTop"), sheetInput,
				],
			}).addStyleClass("sapUiSmallMargin")],
			beginButton: new Button({ text: "Imprimir", type: "Emphasized", press: submit }),
			endButton: new Button({ text: "Cancelar", press: () => dialog.close() }),
			afterClose: () => dialog.destroy(),
		});
		this.getView().addDependent(dialog);
		dialog.open();
	}

	private async printBook(
		params: { BranchCode: string; ItemCode: string; FromDate: string; ToDate: string },
		bookNumber: number, firstSheet: number,
	): Promise<void> {
		try {
			this.setBusy(true);
			await openPdfReport(this.api.fiscalKardexBook, {
				branchCode: params.BranchCode, itemCode: params.ItemCode || null,
				fromDate: params.FromDate, toDate: params.ToDate, bookNumber, firstSheet,
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}
}
