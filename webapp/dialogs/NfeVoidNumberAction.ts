import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Control from "sap/ui/core/Control";
import { openNfeCancelDialog } from "siagrob1/dialogs/NfeCancelDialog";
import { nfeOutcomeMessage, NfeOutcome } from "siagrob1/helpers/NfeHelpers";
import { sendJson, odataValue } from "siagrob1/helpers/FetchHelpers";

const VOID_TEXTS = {
  title: "Inutilizar numeração da NF-e",
  confirm: "Inutilizar",
  warning: "A inutilização é enviada à SEFAZ e não pode ser desfeita: o número desta NF-e rejeitada não poderá mais ser usado.",
};

/**
 * "Inutilizar numeração" das quatro telas (Detail e lista, saída e entrada): pede a justificativa, envia e
 * mostra o desfecho. Devolve true quando o pedido chegou ao servidor (a tela relê o documento).
 */
export async function runNfeVoidNumber(
  owner: Control, url: string, key: string, setBusy: (busy: boolean) => void
): Promise<boolean> {
  const justification = await openNfeCancelDialog(owner, VOID_TEXTS);
  if (justification === null) {
    return false;
  }

  setBusy(true);
  try {
    const result = await sendJson("POST", url, { Key: key, Justification: justification });

    if (!result.ok) {
      MessageBox.error(result.message);
      return true;
    }

    const message = nfeOutcomeMessage(odataValue<NfeOutcome>(result.data));
    if (message.type === "success") {
      MessageToast.show(message.text);
    } else {
      MessageBox.warning(message.text);
    }
    return true;
  } finally {
    setBusy(false);
  }
}
