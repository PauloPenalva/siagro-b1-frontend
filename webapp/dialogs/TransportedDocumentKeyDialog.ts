import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import Input from "sap/m/Input";
import VBox from "sap/m/VBox";
import Label from "sap/m/Label";
import Control from "sap/ui/core/Control";
import { normalizeAccessKey } from "siagrob1/helpers/TransportedDocumentsHelpers";

/**
 * Pede a chave de acesso (44 dígitos) de uma NF-e transportada pelo CT-e. Devolve a chave só com dígitos ou
 * `null` se o usuário desistiu. O botão só habilita com 44 dígitos (espaços colados do portal são ignorados).
 */
export function openTransportedDocumentKeyDialog(owner: Control): Promise<string> {
	return new Promise((resolve) => {
		let result: string = null;

		const confirm = new Button({
			text: "Incluir", type: "Emphasized", enabled: false,
			press: () => { result = normalizeAccessKey(input.getValue()); dialog.close(); },
		});

		const input = new Input({
			width: "100%", placeholder: "44 dígitos",
			liveChange: () => confirm.setEnabled(normalizeAccessKey(input.getValue()) !== ""),
		});

		const dialog = new Dialog({
			title: "Incluir chave de NF-e",
			contentWidth: "32rem",
			content: new VBox({
				items: [new Label({ text: "Chave de acesso", required: true, labelFor: input }), input],
			}).addStyleClass("sapUiSmallMargin"),
			beginButton: confirm,
			endButton: new Button({ text: "Voltar", press: () => dialog.close() }),
			afterClose: () => { dialog.destroy(); resolve(result); },
		});

		owner.addDependent(dialog);
		dialog.open();
	});
}
