import Table from "sap/ui/table/Table";
import CommonController from "../common/CommonController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";

export abstract class BaseController extends CommonController {
  
  onAddProfile() {
    const oTable = this.byId("usersProfilesTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;
    oBinding.create({}, false, true, false);
  }

  onRemoveProfile() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("usersProfilesTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

  /**
   * A grade de balanças não é filha de Users - a entidade vive no banco da empresa, e o usuário
   * no COMMON. Por isso ela tem binding próprio ($$ownRequest), filtrado pelo username depois que
   * a entidade do usuário chega.
   *
   * O filtro vai como texto: sap.ui.model.Filter sobre a coluna de enum Purpose estouraria
   * "Unsupported type", e aqui o mesmo $filter carrega os dois campos.
   */
  protected bindTruckScales(username: string): void {
    const oTable = this.byId("userTruckScalesTable") as Table;
    const oBinding = oTable?.getBinding("rows") as ODataListBinding;

    if (!oBinding) {
      return;
    }

    oBinding.changeParameters({
      $filter: `Username eq '${username.replace(/'/g, "''")}'`
    });
  }

  onAddTruckScale() {
    const username = this.getView().getBindingContext()?.getProperty("Username") as string;

    if (!username) {
      MessageBox.alert("Aguarde o carregamento do usuário.");
      return;
    }

    const oTable = this.byId("userTruckScalesTable") as Table;
    const oBinding = oTable.getBinding("rows") as ODataListBinding;

    oBinding.create({ Username: username, Purpose: "Opening" }, false, true, false);
  }

  onRemoveTruckScale() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("userTruckScalesTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione uma balança para remover.");
      return;
    }

    const oContext = oTable.getContextByIndex(aSelectedIndices[0]) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }

}
