import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Form from "sap/ui/layout/form/Form";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import BaseController from "../BaseController";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";

/**
 * @namespace siagrob1.controller.marketInstruments
 */
export default class Edit extends BaseController {
  private bundle?: ResourceBundle;

  onInit(): void {
    // O código é a chave: não se altera depois de gravado.
    this.getView().setModel(new JSONModel({ isNew: false }), "form");
    this.getRouter().getRoute("marketInstrumentsEdit").attachPatternMatched((ev) => void this.editRouteMatched(ev));
  }

  private async editRouteMatched(ev: Route$MatchedEvent): Promise<void> {
    this.bundle ??= await this.getResourceBundle();
    clearFieldStates(this.byId("formMarketInstrument") as Form);

    const model = this.getView().getModel() as ODataModel;
    if (model.hasPendingChanges(model.getUpdateGroupId())) {
      model.resetChanges(model.getUpdateGroupId());
    }

    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;
    // Código tem espaço ("DOL COM") e pode ter apóstrofo: escapa para o literal OData e para a URL.
    const key = encodeURIComponent(id.replace(/'/g, "''"));
    this.getView().bindElement({
      path: `/MarketInstruments('${key}')`,
      events: {
        dataRequested: () => this.setBusy(true),
        dataReceived: () => this.setBusy(false),
      },
    });
  }

  async onSave(): Promise<void> {
    if (!validateRequiredFields(this.byId("formMarketInstrument") as Form)) {
      MessageBox.warning(this.bundle.getText("commonRequiredFields"));
      return;
    }
    const model = this.getView().getModel() as ODataModel;
    try {
      this.setBusy(true);
      await model.submitBatch(model.getUpdateGroupId());
      if (!model.hasPendingChanges(model.getUpdateGroupId())) {
        MessageToast.show(this.bundle.getText("commonUpdated"), { closeOnBrowserNavigation: false });
        this.navTo("marketInstruments", {}, true);
      }
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    const model = this.getView().getModel() as ODataModel;
    if (model.hasPendingChanges(model.getUpdateGroupId())) {
      model.resetChanges(model.getUpdateGroupId());
    }
    this.onNavBack();
  }
}
