import CommonController from "../common/CommonController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import Button from "sap/m/Button";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { odataValue, sendJson } from "siagrob1/helpers/FetchHelpers";

type EmailSettings = {
  Host: string;
  Port: number;
  UseStartTls: boolean;
  UserName: string;
  Password?: string;
  HasPassword: boolean;
  FromAddress: string;
  FromName: string;
  AutoSendEnabled: boolean;
};

const EMPTY: EmailSettings = {
  Host: "", Port: 587, UseStartTls: true, UserName: "", Password: "", HasPassword: false,
  FromAddress: "", FromName: "", AutoSendEnabled: false,
};

/**
 * Configuração do remetente de e-mail da empresa (só STANDALONE; o servidor exige ADMIN).
 * A senha nunca volta da API: `HasPassword` só indica que existe uma gravada, e senha vazia
 * no Salvar significa "manter".
 *
 * @namespace siagrob1.controller.emailSettings
 */
export default class Main extends CommonController {
  onInit(): void {
    this.getView().setModel(new JSONModel({ ...EMPTY }), "mail");
    this.getRouter().getRoute("emailSettings").attachPatternMatched(() => void this.load());
  }

  private model(): JSONModel {
    return this.getView().getModel("mail") as JSONModel;
  }

  private show(settings?: EmailSettings) {
    this.model().setData({ ...EMPTY, ...(settings ?? {}), Password: "" });
  }

  private async load() {
    this.show(undefined);
    this.setBusy(true);
    try {
      const result = await sendJson("GET", ServerRoutes.emailSettingsGet);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      this.show(result.data ? odataValue<EmailSettings>(result.data) : undefined);
    } finally {
      this.setBusy(false);
    }
  }

  async onSave() {
    const data = this.model().getData() as EmailSettings;
    if (!data.Host?.trim() || !data.FromAddress?.trim() || !(Number(data.Port) > 0)) {
      MessageBox.warning("Informe servidor, porta e e-mail do remetente.");
      return;
    }
    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.emailSettingsSave, {
        Host: data.Host.trim(),
        Port: Number(data.Port),
        UseStartTls: data.UseStartTls,
        UserName: data.UserName ?? "",
        Password: data.Password ?? "",
        FromAddress: data.FromAddress.trim(),
        FromName: data.FromName ?? "",
        AutoSendEnabled: data.AutoSendEnabled,
      });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      await this.load();
      MessageToast.show("Configuração de e-mail gravada.");
    } finally {
      this.setBusy(false);
    }
  }

  /** Pede o destinatário num diálogo simples e dispara o envio de teste. */
  onSendTest() {
    const input = new Input({ type: "Email", placeholder: "destinatario@exemplo.com.br", width: "100%" });
    const dialog = new Dialog({
      title: "Enviar e-mail de teste",
      contentWidth: "24rem",
      content: [input],
      beginButton: new Button({
        text: "Enviar", type: "Emphasized",
        press: () => {
          const to = input.getValue().trim();
          if (!to) {
            input.setValueState("Error");
            return;
          }
          dialog.close();
          void this.sendTest(to);
        },
      }),
      endButton: new Button({ text: "Cancelar", press: () => dialog.close() }),
      afterClose: () => dialog.destroy(),
    });
    this.getView().addDependent(dialog);
    dialog.open();
  }

  private async sendTest(to: string) {
    this.setBusy(true);
    try {
      const result = await sendJson("POST", ServerRoutes.emailSettingsSendTest, { To: to });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      const outcome = odataValue<{ Success?: boolean; Error?: string }>(result.data);
      if (outcome?.Success) {
        MessageBox.success("E-mail de teste enviado.");
      } else {
        MessageBox.error(outcome?.Error || "Não foi possível enviar o e-mail de teste.");
      }
    } finally {
      this.setBusy(false);
    }
  }
}
