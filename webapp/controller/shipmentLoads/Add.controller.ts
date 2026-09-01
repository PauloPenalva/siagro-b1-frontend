import { FormController, LoadForm } from "./FormController";

/**
 * Nova Carga.
 *
 * O formulário nasce em branco, com a data de hoje: nesta tela a Logística PLANEJA a carga, e os
 * romaneios de embarque só são vinculados depois, na lista.
 *
 * @namespace siagrob1.controller.shipmentLoads
 */
export default class Add extends FormController {

  private _branchesLoaded = false;

  onInit(): void {
    this.initFormModels();

    this.getRouter().getRoute("shipmentLoadsNew")
      .attachPatternMatched(() => void this.newRouteMatched());
  }

  private async newRouteMatched(): Promise<void> {
    this.formModel().setData({
      title: "Nova Carga",
      isEdit: false,
      fiscalEditable: true,
      LoadDate: new Date().toISOString().slice(0, 10),
      HasExcess: false,
    } as LoadForm);

    // `getModel()` só resolve o modelo OData depois que a rota casa — em `onInit` é cedo demais.
    if (!this._branchesLoaded) {
      this._branchesLoaded = true;
      await this.loadBranches();
    }

    // Filial e unidade de medida vêm do sistema, como no contrato de compra: a filial é a do
    // usuário logado e a unidade é a padrão do setup. Os dois campos são somente-leitura na
    // tela, então esta é a única origem deles.
    this.setBusy(true);
    try {
      const branchInfo = await this.getBranchInfo();
      this.formModel().setProperty("/BranchCode", branchInfo.code);
      this.formModel().setProperty("/UnitOfMeasureCode", this.getSystemSetup().DefaultUoM);
    } finally {
      this.setBusy(false);
    }
  }
}
