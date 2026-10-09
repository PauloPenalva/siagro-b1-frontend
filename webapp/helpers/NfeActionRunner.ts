import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";
import { NfeOutcome, nfeOutcomeMessage } from "siagrob1/helpers/NfeHelpers";

/**
 * Emitir/consultar/concluir/cancelar NF-e: 400 traz a mensagem de pré-condição/prontidão; 200 traz o desfecho
 * (autorizada, rejeitada, denegada, em processamento). Usado pelo detalhe do documento de saída e pelo painel da
 * recusa da carga — quem chama relê a tela.
 */
export async function runNfeAction(url: string, payload: Record<string, unknown>): Promise<void> {
  const result = await sendJson("POST", url, payload);

  if (!result.ok) {
    MessageBox.error(result.message);
    return;
  }

  const message = nfeOutcomeMessage(odataValue<NfeOutcome>(result.data));
  if (message.type === "success") {
    MessageToast.show(message.text);
  } else if (message.type === "warning") {
    MessageBox.warning(message.text);
  } else {
    MessageBox.error(message.text);
  }
}
