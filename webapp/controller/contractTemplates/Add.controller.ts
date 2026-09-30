import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { previewHtml } from "siagrob1/helpers/ContractDraftPreview";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/** Escopo com que um modelo novo nasce; é também o default do servidor. */
const DEFAULT_SCOPE = "Both";

/**
 * @namespace siagrob1.controller.contractTemplates
 */
export default class Add extends BaseController {
  formatter = { ...formatter, previewHtml };

  onInit(): void {
    this.initOptions();
    this.getRouter().getRoute("contractTemplatesNew")
      .attachPatternMatched(() => void this.newRouteMatched());
  }

  private async newRouteMatched() {
    this.clearFormStates();

    const oView = this.getView();
    const oModel = this.getModel() as ODataModel;
    const oBinding = oModel.bindList("/ContractTemplates");

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    // Toda propriedade editável entra no create(), mesmo vazia: o ODataModel v4 recusa alterar
    // propriedade que ainda não foi lida ("Must not change a property before it has been read")
    // e o erro só aparece quando a pessoa digita no campo.
    const oContext = oBinding.create(
      { Name: "", Title: "", ContractType: DEFAULT_SCOPE, BodyHtml: "", Active: true },
      false,
      false,
      false
    );

    oView.setBindingContext(oContext);

    await this.loadPlaceholders(DEFAULT_SCOPE);
  }

  async onSave() {
    if (!this.validateTemplate()) {
      return;
    }

    const oModel = this.getView().getModel() as ODataModel;

    try {
      this.setBusy(true);
      await oModel.submitBatch(oModel.getUpdateGroupId());

      if (!oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
        MessageToast.show("Dados salvos com sucesso.", { closeOnBrowserNavigation: false });
      }
    } catch (err) {
      this.showSaveError(err);
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
