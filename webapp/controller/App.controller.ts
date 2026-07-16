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
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import Avatar, { Avatar$PressEvent } from "sap/m/Avatar";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";
import { SystemInfo } from "siagrob1/types/SystemInfo";

/**
 * @namespace siagrob1.controller
 */
export default class App extends BaseController {
	private oProductSwitchModel: JSONModel

  private _pPopover: Popover;
  private _avatar: Avatar;
  private _avatarPopover: Popover;

  formatter = formatter;

	public async onInit(): Promise<void> {
    const oView = this.getView();
		oView.addStyleClass(this.getOwnerComponent().getContentDensityClass());

    this._avatar = this.byId("avatar") as Avatar;
    
    /************************************************* */
    /** MENU FIXO - Utilizar apenas em desenvolvimento */
    /************************************************* */
		// this.oModel = new JSONModel();
    // oView.setModel(this.oModel,"menu");
    
    // void this.oModel.loadData(sap.ui.require.toUrl("siagrob1/data/menu.json"))
		// 	.then(() => oView.setModel(this.oModel,"menu"));
    /************************************************* */
    /** MENU FIXO - FIM                                */
    /************************************************* */


    /************************************************* */
    /** MENU DINAMICO                                  */
    /************************************************* */
    const menu = window.localStorage.getItem("USER_MENU");
    if (menu) {
      (this.getModel("menu") as JSONModel)?.setData(JSON.parse(menu));
    }
    /************************************************* */
    /** MENU DINAMICO - FIM                            */
    /************************************************* */

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

    if (!this._avatarPopover) {
      void Fragment.load({
        id: oView.getId(),
        name: "siagrob1.fragments.UserAvatar",
        controller: this
      }).then((oPopover) => {
        if (oPopover) {
          oView.addDependent(oPopover as Popover);
          if (Device.system.phone) {
            (oPopover as Popover).setEndButton(new Button({text: "Fechar", type: "Emphasized", press: () => {
              this._avatarPopover.close();
            }}));
          }
          return oPopover;
        }
      }).then((oPopover) => this._avatarPopover = oPopover as Popover)
    }
    
    await this.setCompanyName();

    this.getRouter().getRoute("main").attachPatternMatched(async (ev) => await this.patternMatched(ev));
	}

  async patternMatched(ev: Route$PatternMatchedEvent){
    const oView = this.getView();

    try {
      this.setBusy(true);
      
      const data = await this.getUserInfo();
      const { authenticated } = data;
      if (!authenticated){
          this.navToLogin();
      }

    } catch (error) {
      const err = error as Error;  
      console.log(err);
      this.navToLogin();
    } finally {
      this.setBusy(false);
    }
  }

  async onChangeBranch() {
    await this.setDefaultBranch();
    await this.displayBranchInfo();
  }

  private async displayBranchInfo() {
    const requestModel = new RequestModel();
    const branchInfo = await requestModel.get(ServerRoutes.getBranchInfo);
      
    (this.getModel("sessionModel") as JSONModel)?.setProperty("/branchInfo", ` - ${branchInfo.shortName} / ${this.formatter.formatCnpj(branchInfo.taxId)}`);
  }

  private async setDefaultBranch() {
    const branchsCtx = await DialogHelper.openTableSelectDialog(this, "BranchsSelectDialog", []);
    const branchCode = branchsCtx?.getObject()?.Code;
    
    await $.ajax({
      url: ServerRoutes.setDefaultBranch,
      method: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ BranchCode: branchCode }),
    });
  }

  private async setCompanyName() {
     const systemInfo = await this.getSystemInfo() as SystemInfo;
    (this.getModel("sessionModel") as JSONModel)?.setProperty("/systemInfo", systemInfo?.companyName);
  }

  private navToLogin(){
    this.navTo("login", {}, true)
  }

	onHomePress(): void {
		this.navTo("main");
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

  onAvatarPress(oEvent: Avatar$PressEvent) {
			const oEventSource = oEvent.getSource();
			const bActive = this._avatar.getActive();

			this._avatar.setActive(!bActive);

			if (bActive) {
				this._avatarPopover.close();
			} else {
				this._avatarPopover.openBy(oEventSource);
			}
		}

  async onLogout(){
    if (!await DialogHelper.confirmDialog("Encerrar a sessão ?", "Sair")){
      return;
    }

    this.setBusy(true);
    setTimeout(() => {
      const requestModel = new RequestModel();    
     
      requestModel.post(ServerRoutes.logout)
        .done(() => {
          window.localStorage.setItem("USER_MENU", JSON.stringify({}));
          
          (this.getModel("menu") as JSONModel)?.setData({});
          
          this.setBusy(false);
          this.navToLogin();
        })
        .catch(() => {
          this.setBusy(false);
          this.navToLogin();
        })
    }, 1000);
    
  }
}
