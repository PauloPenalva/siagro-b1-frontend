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
