import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import TextArea from "sap/m/TextArea";
import MessageStrip from "sap/m/MessageStrip";
import VBox from "sap/m/VBox";
import Label from "sap/m/Label";
import Control from "sap/ui/core/Control";
import { ValueState } from "sap/ui/core/library";
import {
  NFE_CORRECTION_MAX, invalidNfeCorrectionChars, isValidNfeCorrectionText, normalizeNfeCorrectionText,
} from "siagrob1/helpers/NfeHelpers";

/**
 * Pede o texto da CC-e, pré-preenchido com a última carta (a nova substitui as anteriores). Devolve o texto
 * normalizado ou `null` se o usuário desistiu. O botão segue a mesma conta do servidor (15 a 1000, Latin-1).
 */
export function openNfeCorrectionDialog(owner: Control, previousText: string): Promise<string> {
  return new Promise((resolve) => {
    let result: string = null;

    const confirm = new Button({
      text: "Enviar carta", type: "Emphasized", enabled: false,
      press: () => { result = normalizeNfeCorrectionText(text.getValue()); dialog.close(); },
    });

    const validate = () => {
      const invalid = invalidNfeCorrectionChars(text.getValue());
      text.setValueState(invalid.length > 0 ? ValueState.Error : ValueState.None);
      text.setValueStateText(invalid.length > 0 ? `Caracteres não aceitos pela SEFAZ: ${invalid.join(" ")}` : "");
      confirm.setEnabled(isValidNfeCorrectionText(text.getValue()));
    };

    // Mesmo contador do cancelamento: showExceededText mostra o restante e o excesso; o limite fica no botão.
    const text = new TextArea({
      width: "100%", rows: 8, maxLength: NFE_CORRECTION_MAX, showExceededText: true,
      value: previousText ?? "", placeholder: "Mínimo de 15 caracteres",
      liveChange: validate,
    });

    const dialog = new Dialog({
      title: "Carta de Correção",
      contentWidth: "40rem",
      content: new VBox({
        items: [
          new MessageStrip({
            type: "Warning", showIcon: true,
            text: "A nova carta substitui as anteriores: repita todas as correções. Não corrige valores, impostos, " +
              "quantidades, emitente/destinatário nem datas. O envio à SEFAZ não pode ser desfeito.",
          }),
          new Label({ text: "Correção", required: true, labelFor: text }),
          text,
        ],
      }).addStyleClass("sapUiSmallMargin"),
      beginButton: confirm,
      endButton: new Button({ text: "Voltar", press: () => dialog.close() }),
      afterOpen: validate,
      afterClose: () => { dialog.destroy(); resolve(result); },
    });

    owner.addDependent(dialog);
    dialog.open();
  });
}
