import ToolPage from "sap/tnt/ToolPage";
import BaseController from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import { SideNavigation$ItemPressEvent } from "sap/tnt/SideNavigation";
import Popover from "sap/m/Popover";
import Fragment from "sap/ui/core/Fragment";
import Device from "sap/ui/Device";
import Button from "sap/m/Button";
import { MenuItem$PressEvent } from "sap/m/MenuItem";
import { ShellBar$ProductSwitcherPressedEvent } from "sap/f/ShellBar";

/**
 * @namespace siagrob1.controller
 */
export default class App extends BaseController {
	private oModel: JSONModel;
  private oProductSwitchModel: JSONModel

  private _pPopover: Popover;

	public onInit(): void {
    const oView = this.getView()
		oView.addStyleClass(this.getOwnerComponent().getContentDensityClass());

		this.oModel = new JSONModel();
		void this.oModel.loadData(sap.ui.require.toUrl("siagrob1/data/menu.json"))
			.then(() => oView.setModel(this.oModel,"menu"));

    this.oProductSwitchModel = new JSONModel();
    void this.oProductSwitchModel.loadData(sap.ui.require.toUrl("siagrob1/data/productSwitch/data.json"))
      .then(() => oView.setModel(this.oProductSwitchModel, "productSwitch"));

    if (!this._pPopover) {
      void Fragment.load({
        id: oView.getId(),
        name: "siagrob1.fragments.ProductSwitchPopover",
        controller: this
      }).then((oPopover) => {
        if (oPopover) {
          oView.addDependent(oPopover as Popover);
          if (Device.system.phone) {
            (oPopover as Popover).setEndButton(new Button({text: "Fechar", type: "Emphasized", press: () => {
              this._pPopover.close();
            }}));
          }
          return oPopover;
        }
      }).then((oPopover) => this._pPopover = oPopover as Popover)
    }
	}

	onHomePress(): void {
		this.getRouter().navTo("main");
	}

	onMenuButtonPress(): void {
		const toolPage = this.byId("toolPage") as ToolPage;

		toolPage.setSideExpanded(!toolPage.getSideExpanded());
	}

	onItemSelect(ev: SideNavigation$ItemPressEvent) : void {
		const item = ev.getParameter('item');
		this.navTo(item.getKey());
	}

  onOpenProductSwitch(ev: ShellBar$ProductSwitcherPressedEvent) {
    const oControl = ev.getParameter("button");
    this._pPopover.openBy(oControl);    
	}

  onItemPressed(ev: MenuItem$PressEvent){
    const sKey = ev.getSource().getKey();
    if (sKey) {
      this.navTo(sKey);
    }
  }
}
