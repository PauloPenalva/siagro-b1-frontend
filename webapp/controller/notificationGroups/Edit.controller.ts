import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.notificationGroups
 */
export default class Edit extends BaseController {

  onInit(): void {
    this.getRouter().getRoute("notificationGroupsEdit")
      .attachPatternMatched((ev) => this.editRouteMatched(ev));
  }

  private editRouteMatched(ev: Route$MatchedEvent) {
    this.clearStates("formNotificationGroup");

    const oModel = this.getView().getModel() as ODataModel;
    const oView = this.getView();

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    const { id } = ev.getParameter("arguments") as { id: string };

    if (id != null) {
      oView.bindElement({
        // Sem o $expand as duas abas vêm vazias: as coleções-filhas não são carregadas
        // sozinhas pelo binding relativo em GET-by-key.
        path: `/NotificationGroups(${id})`,
        parameters: { $expand: "Members,Subscriptions" },
        events: {
          dataRequested: () => this.setBusy(true),
          dataReceived: () => this.setBusy(false),
        },
      });
    }
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
        oModel.resetChanges(oModel.getUpdateGroupId());
        MessageToast.show("Dados atualizados com sucesso.", { closeOnBrowserNavigation: false });
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
