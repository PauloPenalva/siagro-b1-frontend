import { BaseController } from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";

/**
 * Definição da nova senha a partir do link recebido por e-mail.
 *
 * O token chega na query string (`#/reset-password?token=...`) e é validado antes de a tela
 * mostrar o formulário: pedir a senha duas vezes para só então descobrir que o link expirou é
 * frustração garantida.
 *
 * @namespace siagrob1.controller.login
 */
export default class ResetPassword extends BaseController {

  private token = "";

  onInit(): void {
    this.getRouter().getRoute("resetPassword")
      .attachPatternMatched((ev: Route$PatternMatchedEvent) => void this.routeMatched(ev));
  }

  private async routeMatched(ev: Route$PatternMatchedEvent): Promise<void> {
    const model = new JSONModel();
    model.setProperty("/NewPassword", "");
    model.setProperty("/ConfirmPassword", "");
    // `undefined` enquanto a validação não volta: os três blocos da tela testam por `true`/`false`
    // e nenhum aparece antes da resposta.
    model.setProperty("/valid", undefined);
    model.setProperty("/done", false);

    this.getView().setModel(model, "reset");

    const query = (ev.getParameter("arguments") as { "?query"?: { token?: string } })?.["?query"];
    this.token = query?.token ?? "";

    if (!this.token) {
      model.setProperty("/valid", false);
      return;
    }

    try {
      this.setBusy(true);

      const result = await new RequestModel().get<{ valid?: boolean; passwordRequirements?: string }>(
        `${ServerRoutes.validateResetToken}?token=${encodeURIComponent(this.token)}`);

      model.setProperty("/valid", result?.valid === true);
      // A regra vem do servidor: a política é configurável e um texto fixo aqui divergiria dela.
      model.setProperty("/passwordRequirements", result?.passwordRequirements ?? "");
    } catch {
      model.setProperty("/valid", false);
    } finally {
      this.setBusy(false);
    }
  }

  async onConfirm(): Promise<void> {
    const model = this.getView().getModel("reset") as JSONModel;
    const newPassword = model.getProperty("/NewPassword") as string ?? "";
    const confirmPassword = model.getProperty("/ConfirmPassword") as string ?? "";

    if (!newPassword || !confirmPassword) {
      MessageBox.warning("Informe e confirme a nova senha.");
      return;
    }

    if (newPassword !== confirmPassword) {
      MessageBox.warning("As senhas não conferem.");
      return;
    }

    try {
      this.setBusy(true);

      await new RequestModel().post(ServerRoutes.resetPassword, {
        Token: this.token,
        NewPassword: newPassword
      });

      // O servidor derrubou as sessões do usuário e apagou os cookies desta máquina. Sem limpar o
      // estado local, um usuário que já estivesse logado continuaria vendo a shell montada sobre
      // uma sessão que não existe mais, e só descobriria no próximo 401.
      SessionService.clearSessionState();

      model.setProperty("/done", true);
    } catch (error) {
      const err = error as JQuery.jqXHR;
      MessageBox.error(
        (err.responseJSON as { message?: string })?.message ?? "Falha ao redefinir a senha.");
    } finally {
      this.setBusy(false);
    }
  }

  onRequestNewLink(): void {
    this.navTo("forgotPassword");
  }

  onBackToLogin(): void {
    this.navTo("login");
  }
}
