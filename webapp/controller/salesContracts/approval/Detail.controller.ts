import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import RequestModel from "siagrob1/model/RequestModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import Dialog from "sap/m/Dialog";
import MessageToast from "sap/m/MessageToast";
import SalesContractsBaseController from "../SalesContractsBaseController";
import { SalesContractsTotals } from "siagrob1/types/SalesContractsTotal";
import MessageBox from "sap/m/MessageBox";

/**
 * @namespace siagrob1.controller.salesContracts.approval
 */
export default class Detail extends SalesContractsBaseController {
  private _approvalDialog: Dialog;
  private viewModel: JSONModel;

	onInit(): void  {	
		this.getRouter().getRoute("salesContractsApprovalDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

  onAfterRendering(): void  {
    this.viewModel = this.getModel("viewModel") as JSONModel;
  }

	private detailRouteMatched(ev: Route$MatchedEvent) {
      const {id} = ev.getParameter("arguments") as {id: string };
      const viewModel = this.getModel("viewModel") as JSONModel;
      const uiModel = this.getModel("ui") as JSONModel;
  
      if (id != null) {
  
        uiModel.setProperty("/editable", false);
        
        const sPath = `/SalesContracts(${id})`;
        this.bindElement(sPath);
  
        const requestModel = new RequestModel({Key: id});
        requestModel.get(this.api.salesContractsGetTotals.replace("$", id))
          .then((data: SalesContractsTotals) => {
            viewModel.setProperty("/TotalPrice", data.TotalPrice ?? 0)
            viewModel.setProperty("/TotalVolume", data.TotalVolume ?? 0)
          });
  
        return;
      }
  
    }

	async onApproval() {
    this._approvalDialog ??= await DialogHelper.createDialog(
      this, 
      "siagrob1.view.salesContracts.approval.fragments.ApprovalDialog"
    );

    this.viewModel.setProperty("/dialogTitle", "Aprovar Contrato ?");
    this.viewModel.setProperty("/dialogConfirmButtonText", "Aprovar");
    this.viewModel.setProperty("/dialogAction", "Approval");

    this._approvalDialog?.open();
  }

  async onReject() {
    this._approvalDialog ??= await DialogHelper.createDialog(
      this, 
      "siagrob1.view.salesContracts.approval.fragments.ApprovalDialog"
    );

    this.viewModel.setProperty("/dialogTitle", "Rejeitar Contrato ?");
    this.viewModel.setProperty("/dialogConfirmButtonText", "Rejeitar");
    this.viewModel.setProperty("/dialogAction", "Reject");

    this._approvalDialog?.open();
  }

  onApproveRejectAction() {
    const dlgAction = this.viewModel.getProperty("/dialogAction") as string;
    const context = this.getView().getBindingContext() as Context;
    
    switch (dlgAction) {
      case "Approval":
        this.contractApproved(context);
        break;
      case "Reject":
        this.contractRejected(context);
        break;
      default:
        break;
    }
  }

  private contractApproved(context: Context) {
    this.onCloseApprovalDialog();
    this.setBusy(true)
    
    const key = context.getProperty("Key") as string;
    const code = context.getProperty("Code") as string;
    const comments = context.getProperty("ApprovalComments") as string;

    void jQuery.ajax(this.api.salesContractsApproval, {
      method: 'POST',
      contentType: "application/json",
      data: JSON.stringify({
        Key: key,
        Comments: comments,
      }),
      success: () => {
        this.setBusy(false);
        MessageToast.show(`Contrato ${code} aprovado com sucesso.`)
        this.navToSalesContractsApprovalList();
      },
      error: (err) => {
        MessageBox.error(err.responseJSON?.error?.message as string  || "Erro ao aprovar contrato.")
        this.setBusy(false);
      }
    })  
  }

  private contractRejected(context: Context) {
    this.onCloseApprovalDialog();
    this.setBusy(true)
    
    const key = context.getProperty("Key") as string;
    const code = context.getProperty("Code") as string;
    const comments = context.getProperty("ApprovalComments") as string;

    void jQuery.ajax(this.api.salesContractsReject, {
      method: 'POST',
      contentType: "application/json",
      data: JSON.stringify({
        Key: key,
        Comments: comments,
      }),
      success: () => {
        this.setBusy(false);
        MessageToast.show(`Contrato ${code} rejeitado com sucesso.`)
        this.navToSalesContractsApprovalList();
      },
      error: (err) => {
        MessageBox.error(err.responseJSON?.error?.message as string  || "Erro ao rejeitar contrato.")
        this.setBusy(false);
      }
    })  
  }

  onCloseApprovalDialog() {
    this._approvalDialog?.close();
  }

  navToSalesContractsApprovalList() {
    this.navTo("salesContractsApproval");
  }
}
