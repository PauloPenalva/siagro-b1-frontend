import RequestModel from "siagrob1/model/RequestModel";
import { BaseController } from "./BaseController";
import formatter from "siagrob1/model/formatter";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";

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

		const authModel = new JSONModel();
    authModel.setProperty("/Username", "");
    authModel.setProperty("/Password", "");

    this.getView().setModel(authModel, "auth");
	}

  onLogin() {
    const authModel = this.getView().getModel("auth") as JSONModel;
    const authData = authModel.getData() as any;

    if (!authData.Username || !authData.Password){
      MessageBox.warning("Informe seu usuário e senha.")
      return;
    }

    const requestModel = new RequestModel();
    requestModel.post(this.api.login, authData)
      .done(() => {
        const sessionModel = this.getModel("sessionModel") as JSONModel;
        sessionModel.setProperty("/logged", true);
        
        const oComponent = this.getOwnerComponent();
        oComponent.startSession();

        this.navTo("main");
      })
      .catch(err => {
        console.log(err.responseJSON);
        
        MessageBox.error("Falha ao efetuar login: \n" + err.responseJSON?.message);
      })
  }
}
