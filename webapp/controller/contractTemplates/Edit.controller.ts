import MessageToast from "sap/m/MessageToast";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { previewHtml } from "siagrob1/helpers/ContractDraftPreview";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.contractTemplates
 */
export default class Edit extends BaseController {
  formatter = { ...formatter, previewHtml };

  onInit(): void {
    this.initOptions();
    this.getRouter().getRoute("contractTemplatesEdit")
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

    if (id == null) {
      return;
    }

    // Chave Guid: no OData v4 vai sem aspas no predicado.
    oView.bindElement({
      path: `/ContractTemplates(${id})`,
      events: {
        dataRequested: () => this.setBusy(true),
        // O catálogo de placeholders depende do escopo, que só se conhece depois da leitura.
        dataReceived: () => {
          this.setBusy(false);
          void this.loadPlaceholders(
            oView.getBindingContext()?.getProperty("ContractType") as string
          );
        },
      },
    });
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
        oModel.resetChanges(oModel.getUpdateGroupId());
        MessageToast.show("Dados atualizados com sucesso.", { closeOnBrowserNavigation: false });
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
