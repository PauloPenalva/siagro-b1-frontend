import Dialog from "sap/m/Dialog";
import Button from "sap/m/Button";
import TextArea from "sap/m/TextArea";
import MessageStrip from "sap/m/MessageStrip";
import VBox from "sap/m/VBox";
import Label from "sap/m/Label";
import Control from "sap/ui/core/Control";
import { NFE_CANCEL_MAX, isValidNfeCancelJustification } from "siagrob1/helpers/NfeHelpers";

/**
 * Pede a justificativa do cancelamento da NF-e. Devolve o texto (com trim) ou `null` se o usuário
 * desistiu. O botão só habilita com 15 a 255 caracteres — a mesma conta do servidor.
 */
export function openNfeCancelDialog(owner: Control): Promise<string> {
  return new Promise((resolve) => {
    let result: string = null;

    const confirm = new Button({
      text: "Cancelar NF-e", type: "Reject", enabled: false,
      press: () => { result = text.getValue().trim(); dialog.close(); },
    });

    // Contador nativo do TextArea: só aparece com showExceededText=true ("n caracteres restantes" e,
    // acima do limite, o excesso). Nesse modo o maxLength não corta a digitação: os 255 continuam
    // garantidos pelo botão, que só habilita com 15 a 255 caracteres.
    const text = new TextArea({
      width: "100%", rows: 4, maxLength: NFE_CANCEL_MAX, showExceededText: true,
      placeholder: "Mínimo de 15 caracteres",
      liveChange: () => confirm.setEnabled(isValidNfeCancelJustification(text.getValue())),
    });

    const dialog = new Dialog({
      title: "Cancelar NF-e",
      contentWidth: "32rem",
      content: new VBox({
        items: [
          new MessageStrip({
            type: "Warning", showIcon: true,
            text: "O cancelamento é enviado à SEFAZ e não pode ser desfeito. O documento será cancelado e os saldos estornados.",
          }),
          new Label({ text: "Justificativa", required: true, labelFor: text }),
          text,
        ],
      }).addStyleClass("sapUiSmallMargin"),
      beginButton: confirm,
      endButton: new Button({ text: "Voltar", press: () => dialog.close() }),
      afterClose: () => { dialog.destroy(); resolve(result); },
    });

    owner.addDependent(dialog);
    dialog.open();
  });
}
