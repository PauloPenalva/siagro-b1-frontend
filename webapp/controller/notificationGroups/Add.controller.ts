import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.notificationGroups
 */
export default class Add extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("notificationGroupsNew")
      .attachPatternMatched(() => this.newRouteMatched());
  }

  private newRouteMatched() {
    this.clearStates("formNotificationGroup");

    const oView = this.getView();
    const oModel = this.getModel() as ODataModel;
    const oBinding = oModel.bindList("/NotificationGroups");

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    // Todas as propriedades editáveis precisam entrar aqui, mesmo vazias: o ODataModel v4
    // recusa alterar propriedade que ainda não foi lida ("Must not change a property before
    // it has been read"), e o erro só aparece quando a pessoa digita no campo.
    // Active default true: um grupo criado inativo não recebe nada e a causa não é óbvia.
    const oContext = oBinding.create({ Code: "", Name: "", Active: true }, false, false, false);

    oView.setBindingContext(oContext);
  }

  async onSave() {
    if (!this.validateForm("formNotificationGroup")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        MessageToast.show("Dados salvos com sucesso.", { closeOnBrowserNavigation: false });
      }
    } finally {
      this.setBusy(false);
    }
  }

  onCancel() {
    const oModel = this.getView().getModel() as ODataModel;

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    this.onNavBack();
  }
}
