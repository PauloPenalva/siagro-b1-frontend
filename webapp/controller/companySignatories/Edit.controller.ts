import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.companySignatories
 */
export default class Edit extends BaseController {

  onInit(): void {
    this.setRoleOptions();
    this.getRouter().getRoute("companySignatoriesEdit")
      .attachPatternMatched((ev) => this.editRouteMatched(ev));
  }

  private editRouteMatched(ev: Route$MatchedEvent) {
    this.clearFormStates();

    const oModel = this.getView().getModel() as ODataModel;
    const oView = this.getView();

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    const { id } = ev.getParameter("arguments") as { id: string };

    if (id != null) {
      // Chave Guid: no OData v4 vai sem aspas no predicado, ao contrário das chaves de texto.
      oView.bindElement({
        path: `/CompanySignatories(${id})`,
        events: {
          dataRequested: () => this.setBusy(true),
          dataReceived: () => this.setBusy(false),
        },
      });
    }
  }

  async onSave() {
    if (!this.validateSignatory()) {
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
