import Table from "sap/ui/table/Table";
import CommonController from "../common/CommonController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";

export abstract class BaseController extends CommonController {

  onAddAddress() {
    const tb = this.byId("businessPartnerAddressesTable") as Table;
    const oBinding = tb.getBinding("rows") as ODataListBinding;
    // As propriedades que o value help de município grava precisam existir na linha nova.
    oBinding.create({
      StreetNumber: null,
      Complement: null,
      MunicipalityCode: null,
      ZipCode: null,
      City: "",
      State: "",
      // O Select de tipo (targetType 'any') e o value help de país gravam nestas.
      AdresType: null,
      Country: "BR",
    }, false, true, false);
  }

  onRemoveAddress() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("businessPartnerAddressesTable") as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const index = aSelectedIndices[0];

    const oContext = oTable.getContextByIndex(index) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }
}
