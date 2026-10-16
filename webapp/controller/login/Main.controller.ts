import { BaseController } from "./BaseController";
import formatter from "siagrob1/model/formatter";
import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import SessionService, { Credentials } from "siagrob1/services/SessionService";
import { pickInitialCompany, recallCompany, shouldShowCompanySelect } from "siagrob1/helpers/CompanySelectionHelpers";
import { CompanyOption } from "siagrob1/types/Company";

type AuthViewModel = {
  Username: string;
  Password: string;
  CompanyCode: string;
  Companies: CompanyOption[];
  showCompanySelect: boolean;
};

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

		const authModel = new JSONModel({
      Username: "",
      Password: "",
      CompanyCode: "",
      Companies: [],
      showCompanySelect: false
    } satisfies AuthViewModel);

    this.getView().setModel(authModel, "auth");

    void this.loadCompanies(authModel);
	}

  /**
   * Como no SAP B1: escolhe-se a empresa antes das credenciais. A lista vem primeiro e a seleção
   * depois (um Select com selectedKey antes dos itens renderiza vazio). Falha ao carregar não
   * impede o login: com uma única empresa o servidor a escolhe sozinho.
   */
  private async loadCompanies(authModel: JSONModel): Promise<void> {
    try {
      const companies = await SessionService.loadLoginCompanies();

      authModel.setProperty("/Companies", companies);
      authModel.setProperty("/CompanyCode", pickInitialCompany(companies, recallCompany()));
      authModel.setProperty("/showCompanySelect", shouldShowCompanySelect(companies));
    } catch (error) {
      console.warn("Falha ao carregar as empresas para o login.", error);
    }
  }

  onForgotPassword(): void {
    this.navTo("forgotPassword");
  }

  async onLogin() {
    const authModel = this.getView().getModel("auth") as JSONModel;
    const data = authModel.getData() as AuthViewModel;

    if (!data.Username || !data.Password){
      MessageBox.warning("Informe seu usuário e senha.")
      return;
    }

    if (data.showCompanySelect && !data.CompanyCode) {
      MessageBox.warning("Selecione a empresa.");
      return;
    }

    // Objeto explícito: o modelo da view carrega a lista de empresas, que não pode ir no POST.
    const credentials: Credentials = {
      Username: data.Username,
      Password: data.Password,
      CompanyCode: data.CompanyCode || undefined
    };

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
