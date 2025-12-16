/* eslint-disable @typescript-eslint/no-explicit-any */
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import BaseController from "../PurchaseContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import MessageToast from "sap/m/MessageToast";

/**
 * @namespace siagrob1.controller.purchaseContracts.shipmentRelease
 */
export default class Add extends BaseController {

	onInit(): void  {
		this.getRouter().getRoute("purchaseContractsShipmentReleaseRequest").attachPatternMatched((ev) => this.newRouteMatched(ev));
	}

	private newRouteMatched(ev: Route$MatchedEvent) {
		 const {purchaseContractId} = ev.getParameter("arguments") as {purchaseContractId: string };
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);
    
		this.resetChanges();

    this.clearStates("formPurchaseContractRequestShipmentRelease");
    
    const oView = this.getView();
		const oModel = this.getView().getModel() as ODataModel;
		const oBinding = oModel.bindList("/ShipmentReleases")

		const oContext = oBinding.create({
      PurchaseContractKey: purchaseContractId
    }, false, false, false);

		oView.setBindingContext(oContext);
	}

	async onSave() {
		
    if (!this.validateForm("formPurchaseContractRequestShipmentRelease")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getView().getModel() as ODataModel;

		try {
			this.setBusy(true);
			await oModel.submitBatch(oModel.getUpdateGroupId());
			if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
				MessageToast.show("Solicitação criada com sucesso.");
        this.navToList();
			}
		} finally {
			this.setBusy(false);
		}
	}

  private resetChanges(){
    const oModel = this.getView().getModel() as ODataModel;

		if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
			oModel.resetChanges(oModel.getUpdateGroupId());
		}
  }

	onCancel() {
    this.resetChanges();
    this.onNavBack();
	}

  private navToList() {
    const oContext = this.getView().getBindingContext() as Context;
    if (oContext) {
      this.navTo("purchaseContractsShipmentRelease");
    }
  }
}
