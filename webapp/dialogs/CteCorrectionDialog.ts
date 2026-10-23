import Button, { Button$PressEvent } from "sap/m/Button";
import Column from "sap/m/Column";
import ColumnListItem from "sap/m/ColumnListItem";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import MessageStrip from "sap/m/MessageStrip";
import Select from "sap/m/Select";
import Table from "sap/m/Table";
import Text from "sap/m/Text";
import Toolbar from "sap/m/Toolbar";
import ToolbarSpacer from "sap/m/ToolbarSpacer";
import VBox from "sap/m/VBox";
import Control from "sap/ui/core/Control";
import Item from "sap/ui/core/Item";
import JSONModel from "sap/ui/model/json/JSONModel";
import { CTE_CORRECTABLE_FIELDS, CorrectionRow, correctionRowsError } from "siagrob1/helpers/CteHelpers";

/**
 * CC-e do CT-e: várias linhas de "campo da lista fechada + novo valor". Devolve as linhas ou `null`
 * se o usuário desistiu. O botão só habilita quando as linhas passam na mesma regra do servidor.
 */
export function openCteCorrectionDialog(owner: Control): Promise<CorrectionRow[]> {
	return new Promise((resolve) => {
		let result: CorrectionRow[] = null;
		const model = new JSONModel({ rows: [{ FieldId: "", Value: "" }], fields: CTE_CORRECTABLE_FIELDS, error: "" });

		const rows = () => model.getProperty("/rows") as CorrectionRow[];
		const validate = () => {
			const error = correctionRowsError(rows());
			model.setProperty("/error", error);
			confirm.setEnabled(!error);
		};

		const confirm = new Button({
			text: "Enviar carta", type: "Emphasized", enabled: false,
			press: () => { result = rows().map((r) => ({ ...r })); dialog.close(); },
		});

		const table = new Table({
			headerToolbar: new Toolbar({
				content: [
					new ToolbarSpacer(),
					new Button({
						text: "Adicionar campo", icon: "sap-icon://add",
						press: () => { model.setProperty("/rows", [...rows(), { FieldId: "", Value: "" }]); validate(); },
					}),
				],
			}),
			columns: [
				new Column({ header: new Text({ text: "Campo" }), width: "16rem" }),
				new Column({ header: new Text({ text: "Novo valor" }) }),
				new Column({ width: "3rem" }),
			],
		});
		table.bindItems({
			path: "/rows",
			template: new ColumnListItem({
				cells: [
					new Select({
						forceSelection: false, selectedKey: "{FieldId}", change: validate,
						items: { path: "/fields", template: new Item({ key: "{Id}", text: "{Label}" }), templateShareable: false },
					}),
					new Input({ value: "{Value}", liveChange: validate, valueLiveUpdate: true }),
					new Button({
						icon: "sap-icon://delete", type: "Transparent",
						press: (ev: Button$PressEvent) => {
							const index = Number(ev.getSource().getBindingContext().getPath().split("/").pop());
							model.setProperty("/rows", rows().filter((_, i) => i !== index));
							validate();
						},
					}),
				],
			}),
			templateShareable: false,
		});

		const dialog = new Dialog({
			title: "Carta de Correção do CT-e",
			contentWidth: "48rem",
			content: new VBox({
				items: [
					new MessageStrip({
						type: "Warning", showIcon: true,
						text: "Só os campos da lista podem ser corrigidos (valores, tributos, tomador, remetente, datas e chave não). " +
							"O envio à SEFAZ não pode ser desfeito.",
					}),
					table,
					new Text({ text: "{/error}" }).addStyleClass("sapUiTinyMarginTop"),
				],
			}).addStyleClass("sapUiSmallMargin"),
			beginButton: confirm,
			endButton: new Button({ text: "Voltar", press: () => dialog.close() }),
			afterOpen: validate,
			afterClose: () => { dialog.destroy(); resolve(result); },
		});

		dialog.setModel(model);
		owner.addDependent(dialog);
		dialog.open();
	});
}
