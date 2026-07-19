import { BaseController } from "./BaseController";
import formatter from "siagrob1/model/formatter";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import SessionService, { Credentials } from "siagrob1/services/SessionService";

/**
 * @namespace siagrob1.controller.login
 */
export default class Main extends BaseController {
  formatter = { ...formatter }

	onInit(): void {
		this.getRouter().getRoute("login").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {
    if (SessionService.isAuthenticated()) {
      this.navTo("main");
      return;
    }

    SessionService.clearSessionState();

		const authModel = new JSONModel();
    authModel.setProperty("/Username", "");
    authModel.setProperty("/Password", "");

    this.getView().setModel(authModel, "auth");
	}

  async onLogin() {
    const authModel = this.getView().getModel("auth") as JSONModel;
    const credentials = authModel.getData() as Credentials;

    if (!credentials.Username || !credentials.Password){
      MessageBox.warning("Informe seu usuário e senha.")
      return;
    }

    try {
      this.setBusy(true);

      await SessionService.login(credentials);

      this.navTo("main");
    } catch (error) {
      const err = error as JQuery.jqXHR;
      MessageBox.error("Falha ao efetuar login: \n" + (err.responseJSON as { message?: string })?.message);
    } finally {
      this.setBusy(false);
    }
  }
}
