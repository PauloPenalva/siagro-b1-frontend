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
import Avatar, { Avatar$PressEvent } from "sap/m/Avatar";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import { ListItemBase$PressEvent } from "sap/m/ListItemBase";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";
import SessionService from "siagrob1/services/SessionService";
import VersionService from "siagrob1/services/VersionService";

/**
 * @namespace siagrob1.controller
 */
export default class App extends BaseController {
	private oProductSwitchModel: JSONModel

  private _pPopover: Popover;
  private _avatar: Avatar;
  private _avatarPopover: Popover;
  private _requiredBranchDialog: Dialog;
  private _selectingBranch = false;

  formatter = formatter;

	public onInit(): void {
    const oComponent = this.getOwnerComponent();
    const oView = this.getView();

		oView.addStyleClass(oComponent.getContentDensityClass());

    this._avatar = this.byId("avatar") as Avatar;

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
    
    this.watchSession();
	}

  /**
   * A shell reage à sessão: no boot com sessão válida e a cada login, garante
   * que exista uma filial padrão. Antes isso rodava a cada navegação para "main".
   */
  private watchSession(): void {
    SessionService.attachSessionReady(() => void this.ensureBranchSelected());

    // O boot pode ter terminado antes deste controller existir.
    void SessionService.whenReady().then(() => this.ensureBranchSelected());
  }

  /**
   * Sem filial não há como operar o sistema, então este diálogo é obrigatório:
   * não fecha por Esc nem por clique fora, e a única alternativa a escolher uma
   * filial é sair. Por isso ele não reaproveita o `BranchsSelectDialog`, que é
   * livremente cancelável.
   */
  private async ensureBranchSelected(): Promise<void> {
    if (this._selectingBranch || !SessionService.isAuthenticated() || SessionService.getBranchInfo()?.code) {
      return;
    }

    this._selectingBranch = true;

    try {
      const oDialog = await this.getRequiredBranchDialog();
      oDialog.open();
    } catch (error) {
      this._selectingBranch = false;
      console.error("Falha ao abrir a seleção de filial.", error);
    }
  }

  private async getRequiredBranchDialog(): Promise<Dialog> {
    this._requiredBranchDialog ??= await DialogHelper.createDialog(this, "siagrob1.dialogs.fragments.RequiredBranchDialog");

    return this._requiredBranchDialog;
  }

  /** Bloqueia o fechamento por Esc. */
  onRequiredBranchEscape(oPromise: { reject: () => void }): void {
    oPromise.reject();
  }

  async onRequiredBranchPress(ev: ListItemBase$PressEvent): Promise<void> {
    const branchCode = ev.getSource().getBindingContext().getProperty("Code") as string;

    if (!branchCode) {
      return;
    }

    try {
      this.setBusy(true);

      await SessionService.setDefaultBranch(branchCode);
      await SessionService.loadBranchInfo();

      this._requiredBranchDialog.close();
      this._selectingBranch = false;
    } catch (error) {
      MessageBox.error("Não foi possível definir a filial de trabalho.");
      console.error(error);
    } finally {
      this.setBusy(false);
    }
  }

  async onRequiredBranchExit(): Promise<void> {
    this._requiredBranchDialog.close();
    this._selectingBranch = false;

    await SessionService.logout();
  }

  async onChangeBranch() {
    const branchsCtx = await DialogHelper.openTableSelectDialog(this, "BranchsSelectDialog", []);
    const branchCode = (branchsCtx?.getObject() as { Code?: string })?.Code;

    if (!branchCode) {
      return;
    }

    await SessionService.setDefaultBranch(branchCode);
    await SessionService.loadBranchInfo();
  }

  /** Recarrega a página para carregar a versão recém-publicada. */
  onApplyUpdate(): void {
    VersionService.applyUpdate();
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

  /** Abre "Meu Perfil" pelo menu do avatar - o popover precisa fechar junto com a navegação. */
  onOpenProfile(): void {
    this._avatarPopover.close();
    this._avatar.setActive(false);
    this.navTo("profile");
  }

  async onLogout(){
    if (!await DialogHelper.confirmDialog("Encerrar a sessão ?", "Sair")){
      return;
    }

    try {
      this.setBusy(true);
      await SessionService.logout();
    } finally {
      this.setBusy(false);
    }
  }
}
