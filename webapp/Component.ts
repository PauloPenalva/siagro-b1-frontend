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
import RequestModel from "./model/RequestModel";
import ServerRoutes from "./model/ServerRoutes";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";

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

	public init(): void {
		// call the base component's init function
		super.init();

		// create the device model
		this.setModel(models.createDeviceModel(), "device");

		// create the views based on the url/hash
		this.getRouter().initialize();

    const uiModel = this.getModel("ui") as JSONModel;

    this.getRouter().attachBeforeRouteMatched(() => {
        uiModel.setProperty("/busy", true);
    });

    this.getRouter().attachRouteMatched(function () {
        setTimeout(() => {
            uiModel.setProperty("/busy", false);
        }, 200);
    });

    this._attachMessageModelHandler();
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

  public startSession(): void {
    SessionService.start(this.onSessionExpired.bind(this));
  }

  public stopSession(): void {
    SessionService.stop();
  }

  private onSessionExpired(): void {
    const requestModel = new RequestModel();
    requestModel.post(ServerRoutes.logout)
      .done(() => this.getRouter().navTo("login", {}, true));
  }

	onMessageBindingChange(oEvent: Binding$ChangeEvent) {
    const aContexts = (oEvent.getSource() as ListBinding).getContexts();
    let aMessages: Array<Message> = [],
      bMessageOpen = false;

    this.bError = false;

    if (bMessageOpen || !aContexts.length) {
      return;
    }

    // Extract and remove the technical messages
    // aMessages = aContexts.map((oContext: Context) => oContext.getObject());
    aMessages = aContexts.map((oContext) => oContext.getObject() as Message);

    Messaging.removeMessages(aMessages);

    if (aMessages.length) this.bError = true;

    const { httpStatus } = aMessages[0].getTechnicalDetails() as any;
    if (httpStatus === 401){
      this.getRouter().navTo("login", {}, true);
      return;
    }
    
    MessageBox.error(aMessages[0].getMessage(), {
      id: "serviceErrorMessageBox",
      onClose: () => {
        bMessageOpen = false;
        Messaging.removeAllMessages();
        this.bError = false;
      },
    });

    bMessageOpen = true;
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
