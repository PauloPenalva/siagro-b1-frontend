import RequestModel from "siagrob1/model/RequestModel";
import { BaseController } from "./BaseController";
import formatter from "siagrob1/model/formatter";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * @namespace siagrob1.controller.login
 */
export default class Main extends BaseController {
  formatter = { ...formatter }
  
	onInit(): void | undefined {
		this.getRouter().getRoute("login").attachPatternMatched(() => this.routeMatched())
	}

	private routeMatched() {

    const oComponent = this.getOwnerComponent();
    oComponent.stopSession();

    const sessionModel = this.getModel("sessionModel") as JSONModel;
    sessionModel.setProperty("/logged", false);
    sessionModel.setProperty("/branchInfo", null);

		const authModel = new JSONModel();
    authModel.setProperty("/Username", "");
    authModel.setProperty("/Password", "");

    this.getView().setModel(authModel, "auth");
	}

  async onLogin() {
    const authModel = this.getView().getModel("auth") as JSONModel;
    const authData = authModel.getData() as any;

    if (!authData.Username || !authData.Password){
      MessageBox.warning("Informe seu usuário e senha.")
      return;
    }

    try {
      this.setBusy(true);
      await this.login(authData);
      
      const sessionModel = this.getModel("sessionModel") as JSONModel;
      sessionModel.setProperty("/logged", true);
        
      const oComponent = this.getOwnerComponent();
      oComponent.startSession();

      /** MENU DINAMICO */
      // const userMenu = await this.getUserMenu();

      // window.localStorage.setItem("USER_MENU", JSON.stringify(userMenu));

      // (this.getModel("menu") as JSONModel)?.setData(userMenu);

      this.navTo("main");
    } catch (error) {
      const err = error as JQuery.jqXHR;
      MessageBox.error("Falha ao efetuar login: \n" + err.responseJSON?.message);
    } finally {
      this.setBusy(false);
    }
  }

  async login(authData: any) {
    const requestModel = new RequestModel();
    return await requestModel.post(this.api.login, authData);
  }

  async getUserMenu() {
    const requestModel = new RequestModel();
    return await requestModel.get(ServerRoutes.userMenu);
  }
}
