import UIComponent from "sap/ui/core/UIComponent";
import models from "./model/models";
import Device from "sap/ui/Device";
import Messaging from "sap/ui/core/Messaging";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import ListBinding from "sap/ui/model/ListBinding";
import Message from "sap/ui/core/message/Message";
import { Binding$ChangeEvent } from "sap/ui/model/Binding"
import MessageBox from "sap/m/MessageBox";
import SessionService from "./services/SessionService";
import VersionService from "./services/VersionService";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Router$RouteMatchedEvent } from "sap/ui/core/routing/Router";

/**
 * @namespace siagrob1
 */
export default class Component extends UIComponent {
	public static metadata = {
		manifest: "json",
		interfaces: ["sap.ui.core.IAsyncContentCreation"]
	};

	private contentDensityClass: string;

	bError = false;

  private bMessageOpen = false;

	public init(): void {
		// call the base component's init function
		super.init();

		// create the device model
		this.setModel(models.createDeviceModel(), "device");

    SessionService.init(this);

    // Antes do `initialize()` do router: o serviço acompanha a rota corrente para
    // não recarregar a página por cima de um cadastro em digitação.
    VersionService.init(this);
    VersionService.start();

    const uiModel = this.getModel("ui") as JSONModel;

    this.getRouter().attachBeforeRouteMatched(() => {
        uiModel.setProperty("/busy", true);
    });

    this.getRouter().attachRouteMatched((ev: Router$RouteMatchedEvent) => {
        if (this.guardRoute(ev)) {
            return;
        }

        setTimeout(() => {
            uiModel.setProperty("/busy", false);
        }, 200);
    });

    this._attachMessageModelHandler();

    // create the views based on the url/hash - só depois de conhecer o status
    // da sessão, para que o guard de rota já decida com a informação correta.
    void this.bootstrapSession();
	}

  /**
   * Resolve o status da sessão antes de iniciar o roteamento e, se houver
   * sessão válida, carrega menu/empresa/filial/configuração uma única vez.
   */
  private async bootstrapSession(): Promise<void> {
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/busy", true);

    try {
      if (await SessionService.refreshStatus()) {
        await SessionService.hydrate();
        SessionService.startIdleWatch();
      }
    } catch (error) {
      console.error("Falha ao inicializar a sessão.", error);
    } finally {
      uiModel.setProperty("/busy", false);
      SessionService.notifyReady();
      this.getRouter().initialize();
    }
  }

  /**
   * Bloqueia qualquer rota que não seja o login quando não há sessão.
   *
   * O redirecionamento acontece no `routeMatched` (e não no `beforeRouteMatched`):
   * navegar antes do match terminar apenas troca o hash, e o alvo original ainda
   * é exibido por cima - a tela ficava em branco no `#/login`.
   *
   * @returns `true` quando redirecionou.
   */
  private guardRoute(ev: Router$RouteMatchedEvent): boolean {
    const sRouteName = ev.getParameter("name");

    if (sRouteName === "login" || SessionService.isAuthenticated()) {
      return false;
    }

    this.getRouter().navTo("login", {}, undefined, true);
    return true;
  }

  _attachMessageModelHandler(){
    // error handling
    const oMessageModel = Messaging.getMessageModel();
    const oMessageModelBinding = oMessageModel.bindList(
      "/",
      undefined,
      [],
      new Filter("technical", FilterOperator.EQ, true)
    );

    oMessageModelBinding.attachChange(this.onMessageBindingChange.bind(this), this);
  }

	onMessageBindingChange(oEvent: Binding$ChangeEvent) {
    // O cast é necessário: `getSource()` devolve `Binding`, que não tem `getContexts`.
    // A regra o acusa de redundante, mas remover quebra o `tsc` (TS2551).
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const aContexts = (oEvent.getSource() as ListBinding).getContexts();
    let aMessages: Array<Message> = [];

    this.bError = false;

    if (this.bMessageOpen || !aContexts.length) {
      return;
    }

    // Extract and remove the technical messages
    // aMessages = aContexts.map((oContext: Context) => oContext.getObject());
    aMessages = aContexts.map((oContext) => oContext.getObject() as Message);

    Messaging.removeMessages(aMessages);

    if (aMessages.length) this.bError = true;

    const { httpStatus } = (aMessages[0]?.getTechnicalDetails() ?? {}) as { httpStatus?: number };
    if (httpStatus && httpStatus === 401){
      SessionService.clearSessionState();
      this.getRouter().navTo("login", {}, undefined, true);
      return;
    }

    MessageBox.error(aMessages[0].getMessage(), {
      id: "serviceErrorMessageBox",
      onClose: () => {
        this.bMessageOpen = false;
        Messaging.removeAllMessages();
        this.bError = false;
      },
    });

    this.bMessageOpen = true;
  }
	/**
	 * This method can be called to determine whether the sapUiSizeCompact or sapUiSizeCozy
	 * design mode class should be set, which influences the size appearance of some controls.
	 * @public
	 * @returns css class, either 'sapUiSizeCompact' or 'sapUiSizeCozy' - or an empty string if no css class should be set
	 */
	public getContentDensityClass(): string {
		if (this.contentDensityClass === undefined) {
			// check whether FLP has already set the content density class; do nothing in this case
			if (document.body.classList.contains("sapUiSizeCozy") || document.body.classList.contains("sapUiSizeCompact")) {
				this.contentDensityClass = "";
			} else if (!Device.support.touch) {
				// apply "compact" mode if touch is not supported
				this.contentDensityClass = "sapUiSizeCompact";
			} else {
				// "cozy" in case of touch support; default for most sap.m controls, but needed for desktop-first controls like sap.ui.table.Table
				this.contentDensityClass = "sapUiSizeCozy";
			}
		}
		return this.contentDensityClass;
	}
}
