import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import BaseController from "../SalesContractsBaseController";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import MessageToast from "sap/m/MessageToast";

/**
 * @namespace siagrob1.controller.salesContracts.shipmentRelease
 */
export default class Add extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("salesContractsShipmentReleaseRequest").attachPatternMatched((ev) => this.newRouteMatched(ev));
  }

  private newRouteMatched(ev: Route$MatchedEvent) {
    const { salesContractId } = ev.getParameter("arguments") as { salesContractId: string };
    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);

    this.resetChanges();

    this.clearStates("formSalesContractRequestShipmentRelease");

    const oView = this.getView();
    const oModel = this.getView().getModel() as ODataModel;
    const oBinding = oModel.bindList("/SalesShipmentReleases");

    const oContext = oBinding.create({
      SalesContractKey: salesContractId
    }, false, false, false);

    oView.setBindingContext(oContext);
  }

  async onSave() {

    if (!this.validateForm("formSalesContractRequestShipmentRelease")) {
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

  private resetChanges() {
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
      this.navTo("salesContractsShipmentRelease");
    }
  }
}
