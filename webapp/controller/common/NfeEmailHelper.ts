import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Button$PressEvent } from "sap/m/Button";
import Event from "sap/ui/base/Event";
import Fragment from "sap/ui/core/Fragment";
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import { odataCollection, sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  EMAIL_PATTERN, NFE_EMAIL_MAX, nfeEmailListError, NfeEmailMessageRow, toNfeEmailHistoryRow,
} from "siagrob1/helpers/NfeEmailHelpers";

type Row = { Address: string };

/**
 * Envio manual do e-mail da NF-e + histórico, compartilhado por Documento de Saída e de Entrada.
 * Cada Detail cria uma instância e delega os handlers da view para ela (o diálogo usa a própria
 * instância como controller do fragmento).
 *
 * `documentType`: 1 = saída, 2 = entrada (contrato `NfeEmailDefaultRecipients`).
 */
export default class NfeEmailHelper {
  private dialog?: Dialog;
  private resolveDialog?: (list: string[]) => void;
  private readonly dialogModel = new JSONModel({ rows: [] as Row[] });
  private readonly historyModel = new JSONModel({ rows: [], busy: false });
  private currentKey = "";

  constructor(
    private readonly view: View,
    private readonly documentType: 1 | 2,
    private readonly sendRoute: string,
  ) {
    view.setModel(this.historyModel, "nfeEmail");
  }

  /** Limpa o histórico do documento anterior ao trocar de nota. */
  reset(): void {
    this.currentKey = "";
    this.historyModel.setData({ rows: [], busy: false });
  }

  async loadHistory(key: string): Promise<void> {
    this.currentKey = key;
    this.historyModel.setProperty("/busy", true);
    try {
      // Só DocumentKey no $filter: filtro por enum (DocumentType) falha neste backend.
      const result = await sendJson("GET", `/odata/NfeEmailMessages?$filter=DocumentKey eq ${key}&$orderby=CreatedAt desc`);
      if (key !== this.currentKey) {
        return;
      }
      this.historyModel.setProperty("/rows", result.ok
        ? odataCollection<NfeEmailMessageRow>(result.data).map(toNfeEmailHistoryRow) : []);
      if (!result.ok) {
        MessageToast.show(result.message);
      }
    } finally {
      this.historyModel.setProperty("/busy", false);
    }
  }

  /** Abre o diálogo com os e-mails do parceiro, envia e recarrega o histórico. */
  async send(key: string, setBusy: (busy: boolean) => void): Promise<void> {
    setBusy(true);
    try {
      const defaults = await sendJson("GET", `/odata/NfeEmailDefaultRecipients(DocumentType=${this.documentType},Key=${key})`);
      if (!defaults.ok) {
        MessageBox.error(defaults.message);
        return;
      }
      const recipients = await this.openDialog(odataCollection<string>(defaults.data));
      if (recipients.length === 0) {
        return;
      }

      const result = await sendJson("POST", this.sendRoute, { Key: key, Recipients: recipients });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      MessageToast.show("E-mail enfileirado para envio.");
    } finally {
      setBusy(false);
      void this.loadHistory(key);
    }
  }

  /** Lista vazia = o usuário desistiu (confirmar exige ao menos um destinatário). */
  private async openDialog(addresses: string[]): Promise<string[]> {
    this.dialogModel.setData({ rows: addresses.map((Address) => ({ Address })) });
    if (!this.dialog) {
      this.dialog = await Fragment.load({
        name: "siagrob1.view.common.fragments.NfeEmailDialog", controller: this,
      }) as Dialog;
      this.dialog.setModel(this.dialogModel, "nfeEmailDialog");
      // Escape (e qualquer outro fechamento) também precisa resolver a promessa, senão a tela fica ocupada.
      this.dialog.attachAfterClose(() => this.settle([]));
      this.view.addDependent(this.dialog);
    }
    return new Promise((resolve) => {
      this.resolveDialog = resolve;
      this.dialog.open();
    });
  }

  private rows(): Row[] {
    return this.dialogModel.getProperty("/rows") as Row[];
  }

  /** Resolve uma única vez; depois do primeiro desfecho as demais chamadas são ignoradas. */
  private settle(list: string[]): void {
    const resolve = this.resolveDialog;
    this.resolveDialog = undefined;
    resolve?.(list);
  }

  private finish(list: string[]): void {
    this.settle(list);
    this.dialog.close();
  }

  onAddNfeEmail(): void {
    if (this.rows().length >= NFE_EMAIL_MAX) {
      MessageBox.warning(`Máximo de ${NFE_EMAIL_MAX} e-mails por envio.`);
      return;
    }
    this.dialogModel.setProperty("/rows", [...this.rows(), { Address: "" }]);
  }

  onRemoveNfeEmail(ev: Button$PressEvent): void {
    const row = ev.getSource().getBindingContext("nfeEmailDialog").getObject() as Row;
    this.dialogModel.setProperty("/rows", this.rows().filter((r) => r !== row));
  }

  onNfeEmailChange(ev: Event): void {
    const input: Input = ev.getSource();
    const value = input.getValue().trim();
    const duplicated = value !== "" && this.rows().filter((r) => (r.Address ?? "").trim().toLowerCase() === value.toLowerCase()).length > 1;
    const invalid = value !== "" && !EMAIL_PATTERN.test(value);
    input.setValueState(invalid || duplicated ? "Error" : "None");
    input.setValueStateText(invalid ? "E-mail inválido." : duplicated ? "E-mail repetido." : "");
  }

  onConfirmNfeEmail(): void {
    const list = this.rows().map((r) => (r.Address ?? "").trim()).filter((a) => a !== "");
    if (list.length === 0) {
      MessageBox.warning("Informe ao menos um destinatário.");
      return;
    }
    const error = nfeEmailListError(list, "envio");
    if (error) {
      MessageBox.warning(error);
      return;
    }
    this.finish(list);
  }

  onCancelNfeEmail(): void {
    this.finish([]);
  }
}
