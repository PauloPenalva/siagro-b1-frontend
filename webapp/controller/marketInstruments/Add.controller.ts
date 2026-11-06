import MessageToast from "sap/m/MessageToast";
import MessageBox from "sap/m/MessageBox";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import Form from "sap/ui/layout/form/Form";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import SessionService from "siagrob1/services/SessionService";
import BaseController from "../BaseController";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";
import { MarketInstrument } from "siagrob1/types/MarketInstrument";

/**
 * @namespace siagrob1.controller.marketInstruments
 */
export default class Add extends BaseController {
  private bundle?: ResourceBundle;

  onInit(): void {
    this.getView().setModel(new JSONModel({ isNew: true, canManage: false }), "form");
    this.getRouter().getRoute("marketInstrumentsNew").attachPatternMatched(() => void this.newRouteMatched());
  }

  private async newRouteMatched(): Promise<void> {
    this.bundle ??= await this.getResourceBundle();
    (this.getView().getModel("form") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    clearFieldStates(this.byId("formMarketInstrument") as Form);

    const model = this.getModel() as ODataModel;
    if (model.hasPendingChanges(model.getUpdateGroupId())) {
      model.resetChanges(model.getUpdateGroupId());
    }

    const defaults: MarketInstrument = {
      Exchange: "Cbot", Type: "Future", QuoteUnit: "UsCentsPerBushel",
      ContractSize: 1, TonFactor: 1, SortOrder: 0, Active: true,
    };
    const context = model.bindList("/MarketInstruments").create(defaults, false, false, false);
    this.getView().setBindingContext(context);
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
        MessageToast.show(this.bundle.getText("commonSaved"), { closeOnBrowserNavigation: false });
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
