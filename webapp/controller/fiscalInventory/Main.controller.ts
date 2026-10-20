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
import { MultiInput$TokenUpdateEvent } from "sap/m/MultiInput";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { readErrorMessage } from "siagrob1/helpers/FetchHelpers";
import { openPdfReport } from "siagrob1/helpers/PdfReportHelpers";

type InventoryRow = {
	ncm: string;
	itemCode: string;
	itemName: string;
	unitOfMeasureCode: string;
	quantity: number;
	unitCost: number;
	value: number;
};

type InventoryData = {
	rows?: InventoryRow[];
	totalValue?: number;
	pendingComplementItems?: string[];
};

type SelectedItem = { ItemCode: string; ItemName: string };

type Params = { BranchCode: string; BranchName: string; Items: SelectedItem[]; Date: string };

const SELECTION_KEY_PREFIX = "siagrob1.fiscalInventory.items.";

type Column = { label: string; property: keyof InventoryRow; type?: EdmType; scale?: number; width?: number };

const COLUMNS: Column[] = [
	{ label: "NCM", property: "ncm", width: 12 },
	{ label: "Produto", property: "itemCode" },
	{ label: "Descrição", property: "itemName", width: 40 },
	{ label: "UM", property: "unitOfMeasureCode" },
	{ label: "Quantidade", property: "quantity", type: EdmType.Number, scale: 3 },
	{ label: "Custo unitário", property: "unitCost", type: EdmType.Number, scale: 6 },
	{ label: "Valor", property: "value", type: EdmType.Number, scale: 2 },
];

/**
 * Inventário em Data: posição do estoque PEPS ao fim do dia escolhido, por produto, com total geral, e impressão do
 * Livro de Registro de Inventário (modelo 7). A seleção de produtos (vazia = todos) vale para a grade e para o livro
 * e fica guardada por usuário no navegador.
 * @namespace siagrob1.controller.fiscalInventory
 */
export default class Main extends CommonController {
	onInit(): void {
		// Padrão: 31/12 do ano anterior (data local, nunca toISOString).
		const lastYearEnd = new Date(new Date().getFullYear() - 1, 11, 31);
		this.getView().setModel(new JSONModel({
			BranchCode: "", BranchName: "", Items: [], Date: localIsoDate(lastYearEnd),
		}), "params");
		this.getView().setModel(new JSONModel({
			rows: [], totalValue: 0, pending: [], pendingText: "", searched: false,
		}), "inventory");
		void this.prefillBranch();
		this.getRouter().getRoute("fiscalInventory")?.attachPatternMatched(() => this.restoreSelection());
	}

	/** Chave da última seleção de produtos do usuário logado. */
	private selectionKey(): string {
		const userName = (this.getModel("sessionModel") as JSONModel | undefined)?.getProperty("/userName") as string ?? "";
		return SELECTION_KEY_PREFIX + userName.toLowerCase();
	}

	private restoreSelection(): void {
		let items: SelectedItem[] = [];
		try {
			const stored = JSON.parse(window.localStorage.getItem(this.selectionKey()) ?? "[]") as unknown;
			if (Array.isArray(stored)) {
				items = (stored as SelectedItem[]).filter((i) => typeof i?.ItemCode === "string" && i.ItemCode !== "");
			}
		} catch {
			items = [];
		}
		(this.getModel("params") as JSONModel).setProperty("/Items", items);
	}

	private saveSelection(items: SelectedItem[]): void {
		(this.getModel("params") as JSONModel).setProperty("/Items", items);
		try {
			window.localStorage.setItem(this.selectionKey(), JSON.stringify(items));
		} catch {
			// navegador sem armazenamento local: a seleção só não é lembrada
		}
	}

	private selectedItemCodes(): string[] {
		return this.getParams().Items.map((i) => i.ItemCode);
	}

	/** Acrescenta à seleção os produtos marcados no diálogo (sem repetir). */
	async onItemsValueHelp(): Promise<void> {
		const contexts = await DialogHelper.openTableMultiSelectDialog(this, "ItemsSelectDialog", ["ItemCode", "ItemName"]);
		if (!contexts.length) return;

		const items = [...this.getParams().Items];
		for (const context of contexts) {
			const itemCode = context.getProperty("ItemCode") as string;
			if (!items.some((i) => i.ItemCode === itemCode)) {
				items.push({ ItemCode: itemCode, ItemName: context.getProperty("ItemName") as string });
			}
		}
		this.saveSelection(items);
	}

	onItemsTokenUpdate(ev: MultiInput$TokenUpdateEvent): void {
		const removed = (ev.getParameter("removedTokens") ?? []).map((t) => t.getKey());
		if (!removed.length) return;
		this.saveSelection(this.getParams().Items.filter((i) => !removed.includes(i.ItemCode)));
	}

	onClearItems(): void {
		this.saveSelection([]);
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

	formatTotal(total: number): string {
		return `Total geral: R$ ${(total ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}

	private getParams(): Params {
		return (this.getModel("params") as JSONModel).getData() as Params;
	}

	async onSearch(): Promise<void> {
		const params = this.getParams();

		if (!params.BranchCode) {
			MessageBox.warning("Informe a filial.");
			return;
		}
		if (!params.Date) {
			MessageBox.warning("Informe a data.");
			return;
		}

		try {
			this.setBusy(true);
			const response = await fetch(this.api.fiscalInventory, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					branchCode: params.BranchCode,
					date: params.Date,
					itemCodes: this.selectedItemCodes(),
				}),
			});

			if (!response.ok) {
				MessageBox.error((await readErrorMessage(response)) || "Falha ao consultar o inventário.");
				return;
			}

			const data = await response.json() as InventoryData;
			const pending = data.pendingComplementItems ?? [];
			(this.getModel("inventory") as JSONModel).setData({
				rows: data.rows ?? [],
				totalValue: data.totalValue ?? 0,
				pending,
				pendingText: pending.length
					? `Produtos com complemento de valor sem camada aberta (o valor pode estar incompleto): ${pending.join("; ")}`
					: "",
				searched: true,
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}

	onExport(): void {
		const rows = ((this.getModel("inventory") as JSONModel).getProperty("/rows") as InventoryRow[]) ?? [];
		const params = this.getParams();

		const sheet = new Spreadsheet({
			dataSource: rows,
			fileName: `InventarioEmData-${params.BranchCode}-${params.Date}.xlsx`,
			workbook: {
				context: { sheetName: "Inventário" },
				columns: COLUMNS.map((c) => ({
					label: c.label,
					property: c.property,
					type: c.type,
					width: c.width,
					...(c.type === EdmType.Number ? { scale: c.scale, delimiter: true } : {}),
				})),
			},
		});
		void sheet.build()
			.catch((error: unknown) => MessageBox.error((error as Error)?.message ?? "Falha ao exportar para Excel."))
			.finally(() => sheet.destroy());
	}

	/** Pede Nº do livro e folha inicial; o livro sai com os produtos selecionados (vazio = todos). */
	onPrintBook(): void {
		const params = this.getParams();

		if (!params.BranchCode || !params.Date) {
			MessageBox.warning("Informe a filial e a data.");
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
			void this.confirmAndPrint(bookNumber, firstSheet);
		};
		const bookInput = new Input({ type: "Number", width: "100%", required: true, submit });
		const sheetInput = new Input({ type: "Number", width: "100%", value: "1", submit });
		const dialog: Dialog = new Dialog({
			title: "Imprimir livro de inventário",
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

	/**
	 * Reconsulta o inventário com a filial, a data e a seleção de produtos ATUAIS para obter os complementos pendentes
	 * reais do livro; o resultado da última consulta pode estar velho.
	 */
	private async confirmAndPrint(bookNumber: number, firstSheet: number): Promise<void> {
		const params = this.getParams();
		const itemCodes = this.selectedItemCodes();

		try {
			this.setBusy(true);

			const response = await fetch(this.api.fiscalInventory, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ branchCode: params.BranchCode, date: params.Date, itemCodes }),
			});
			if (!response.ok) {
				MessageBox.error((await readErrorMessage(response)) || "Falha ao consultar o inventário.");
				return;
			}
			const pending = ((await response.json()) as InventoryData).pendingComplementItems ?? [];

			if (pending.length) {
				// sem o busy por cima do diálogo de confirmação
				this.setBusy(false);
				const proceed = await new Promise<boolean>((resolve) => {
					MessageBox.confirm(
						`Os produtos abaixo têm complemento de valor sem camada aberta e o valor do livro pode estar incompleto:\n\n${pending.join("\n")}\n\nImprimir mesmo assim?`,
						{
							title: "Complementos pendentes",
							actions: [MessageBox.Action.YES, MessageBox.Action.NO],
							emphasizedAction: MessageBox.Action.NO,
							onClose: (action: unknown) => resolve(action === "YES"),
						},
					);
				});
				if (!proceed) return;
				this.setBusy(true);
			}

			await openPdfReport(this.api.fiscalInventoryBook, {
				branchCode: params.BranchCode, date: params.Date, bookNumber, firstSheet, itemCodes,
			});
		} catch (error) {
			MessageBox.error((error as Error).message);
		} finally {
			this.setBusy(false);
		}
	}
}
