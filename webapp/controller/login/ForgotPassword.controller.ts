import { BaseController } from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * Pedido do link de redefinição de senha.
 *
 * O servidor responde a mesma coisa exista ou não a conta - esta tela repete essa resposta sem
 * interpretá-la, porque distinguir os casos aqui entregaria de volta a informação que o endpoint
 * esconde de propósito.
 *
 * @namespace siagrob1.controller.login
 */
export default class ForgotPassword extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("forgotPassword").attachPatternMatched(() => this.routeMatched());
  }

  private routeMatched(): void {
    const model = new JSONModel();
    model.setProperty("/UsernameOrEmail", "");
    model.setProperty("/sent", false);
    model.setProperty("/message", "");

    this.getView().setModel(model, "forgot");
  }

  async onSend(): Promise<void> {
    const model = this.getView().getModel("forgot") as JSONModel;
    const usernameOrEmail = (model.getProperty("/UsernameOrEmail") as string ?? "").trim();

    if (!usernameOrEmail) {
      MessageBox.warning("Informe seu usuário ou e-mail.");
      return;
    }

    try {
      this.setBusy(true);

      const response = await new RequestModel()
        .post(ServerRoutes.forgotPassword, { UsernameOrEmail: usernameOrEmail }) as { message?: string };

      model.setProperty(
        "/message",
        response?.message ??
        "Se o usuário informado existir e tiver e-mail cadastrado, enviaremos um link para redefinição de senha.");
      model.setProperty("/sent", true);
    } catch (error) {
      const err = error as JQuery.jqXHR;
      MessageBox.error(
        "Falha ao solicitar a redefinição: \n" + ((err.responseJSON as { message?: string })?.message ?? ""));
    } finally {
      this.setBusy(false);
    }
  }

  onBackToLogin(): void {
    this.navTo("login");
  }
}
