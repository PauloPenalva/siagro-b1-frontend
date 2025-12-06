import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import Context from "sap/ui/model/odata/v4/Context";
import RequestModel from "siagrob1/model/RequestModel";
import { PurchaseContractsTotals } from "siagrob1/types/PurchaseContractsTotal";
import JSONModel from "sap/ui/model/json/JSONModel";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import PurchaseContractsBaseController from "../PurchaseContractsBaseController";

/**
 * @namespace siagrob1.controller.purchaseContracts.approval
 */
export default class Detail extends PurchaseContractsBaseController {
  private _approvalDialog: Dialog;
  private viewModel: JSONModel;

	onInit(): void  {	
		this.getRouter().getRoute("purchaseContractsApprovalDetail").attachPatternMatched((ev) => this.detailRouteMatched(ev));
	}

  onAfterRendering(): void  {
    this.viewModel = this.getModel("viewModel") as JSONModel;
  }

	private detailRouteMatched(ev: Route$MatchedEvent) {
		const {id} = ev.getParameter("arguments") as {id: string };
    const uiModel = this.getModel("ui") as JSONModel;

		if (id != null) {

      uiModel.setProperty("/editable", false);
      
			const sPath = `/PurchaseContracts(${id})`;
			this.bindElement(sPath);

      const requestModel = new RequestModel({Key: id});
      requestModel.post(this.api.purchaseContractsTotals)
        .then((data: PurchaseContractsTotals) => {
          
          this.viewModel.setProperty("/TotalPrice", data.TotalPrice ?? 0)
          this.viewModel.setProperty("/TotalTax", data.TotalTax ?? 0)
          this.viewModel.setProperty("/AvailableVolumeToPricing", data.AvailableVolumeToPricing ?? 0)
          this.viewModel.setProperty("/FixedVolume", data.FixedVolume ?? 0)
          this.viewModel.setProperty("/TotalAvailableToRelease", data.TotalAvailableToRelease ?? 0)
          this.viewModel.setProperty("/TotalShipmentReleases", data.TotalShipmentReleases ?? 0)
          this.viewModel.setProperty("/TotalVolume", data.TotalVolume ?? 0)
          this.viewModel.setProperty("/TotalStandard", data.TotalStandard ?? 0)
        });

			return;
		}

	}

	onEdit() {
    const oContext = this.getView().getBindingContext() as Context
    if (oContext) {
      this.navTo("purchaseContractsEdit", {id: oContext.getProperty("Key") as string });
    }
  }


  async onApproval() {
    this._approvalDialog ??= await DialogHelper.createDialog(
      this, 
      "siagrob1.view.purchaseContracts.approval.fragments.ApprovalDialog"
    );

    this.viewModel.setProperty("/dialogTitle", "Aprovar Contrato ?");
    this.viewModel.setProperty("/dialogConfirmButtonText", "Aprovar");
    this.viewModel.setProperty("/dialogAction", "Approval");

    this._approvalDialog?.open();
  }

  async onReject() {
    this._approvalDialog ??= await DialogHelper.createDialog(
      this, 
      "siagrob1.view.purchaseContracts.approval.fragments.ApprovalDialog"
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

    void jQuery.ajax(this.api.purchaseContractsApproval, {
      method: 'POST',
      contentType: "application/json",
      data: JSON.stringify({
        Key: key,
        Comments: comments,
      }),
      success: () => {
        this.setBusy(false);
        MessageToast.show(`Contrato ${code} aprovado com sucesso.`)
        this.navToPurchaseContractsApprovalList();
      },
      error: (err) => {
        //MessageBox.error(err.responseJSON?.message as string  || "Erro ao aprovar contrato.")
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

    void jQuery.ajax(this.api.purchaseContractsReject, {
      method: 'POST',
      contentType: "application/json",
      data: JSON.stringify({
        Key: key,
        Comments: comments,
      }),
      success: () => {
        this.setBusy(false);
        MessageToast.show(`Contrato ${code} rejeitado com sucesso.`)
        this.navToPurchaseContractsApprovalList();
      },
      error: (err) => {
        //MessageBox.error(err.responseJSON?.message as string  || "Erro ao rejeitar contrato.")
        this.setBusy(false);
      }
    })  
  }

  onCloseApprovalDialog() {
    this._approvalDialog?.close();
  }

  navToPurchaseContractsApprovalList() {
    this.navTo("purchaseContractsApproval");
  }
}
