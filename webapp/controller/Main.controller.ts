import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import BaseController from "./BaseController";
import RequestModel from "siagrob1/model/RequestModel";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import JSONModel from "sap/ui/model/json/JSONModel";
import formatter from "siagrob1/model/formatter";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * @namespace siagrob1.controller
 */
export default class Main extends BaseController {

  formatter = { ...formatter };

	onInit(): void | undefined {
    this.getRouter().getRoute("main").attachPatternMatched(async (ev) => await this.patternMatched(ev));
	}

   async patternMatched(ev: Route$PatternMatchedEvent){
      try {
        this.setBusy(true);
        
        await this.setSystemSetup();
        
        const data = await this.getUserInfo();
        const { authenticated } = data;
        if (!authenticated){
            this.navToLogin();
        }
  
        const { code } = await this.getBranchInfo();
        if (!code){
          await this.setDefaultBranch();
        }
        
        await this.displayBranchInfo();
        
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
  
    private navToLogin(){
      this.navTo("login", {}, true)
    }
}
