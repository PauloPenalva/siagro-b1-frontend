import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { BaseController } from "./BaseController";

/**
 * @namespace siagrob1.controller.companySignatories
 */
export default class Add extends BaseController {

  onInit(): void {
    this.setRoleOptions();
    this.getRouter().getRoute("companySignatoriesNew")
      .attachPatternMatched(() => this.newRouteMatched());
  }

  private newRouteMatched() {
    this.clearFormStates();

    const oView = this.getView();
    const oModel = this.getModel() as ODataModel;
    const oBinding = oModel.bindList("/CompanySignatories");

    if (oModel.hasPendingChanges(oModel.getUpdateGroupId())) {
      oModel.resetChanges(oModel.getUpdateGroupId());
    }

    // Toda propriedade editável entra no create(), mesmo vazia: o ODataModel v4 recusa alterar
    // propriedade que ainda não foi lida ("Must not change a property before it has been read")
    // e o erro só aparece quando a pessoa digita no campo.
    //
    // BranchCode nasce NULO, não "": nulo é "assina por todas as filiais", e string vazia
    // quebraria a FK com Branch. Role default SignAsParty, o mesmo do servidor.
    const oContext = oBinding.create(
      { BranchCode: null, Name: "", TaxId: "", Email: "", Role: "SignAsParty", Order: 0, Active: true },
      false,
      false,
      false
    );

    oView.setBindingContext(oContext);
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
