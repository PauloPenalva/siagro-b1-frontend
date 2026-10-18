import Table from "sap/ui/table/Table";
import CommonController from "../common/CommonController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Select, { Select$ChangeEvent } from "sap/m/Select";
import SessionService from "siagrob1/services/SessionService";

export abstract class BaseController extends CommonController {

  /**
   * Tipo mudou na inclusão (STANDALONE): a série vem de `Customer` (C…) ou `Supplier` (F…), então a
   * lista do Select é refiltrada e a série padrão do tipo é escolhida, voltando ao modo automático
   * (o código digitado de uma série Manual anterior é descartado). Na edição o código é imutável e
   * em SAPB1 não há série: nada a fazer.
   */
  async onCardTypeChange(event: Select$ChangeEvent): Promise<void> {
    const uiModel = this.getModel("ui") as JSONModel;

    if (SessionService.isSapMode() || uiModel.getProperty("/docNumberSeriesEditable") !== true) {
      return;
    }

    const cardType = event.getSource().getSelectedKey();
    const transaction = cardType === "S" ? "Supplier" : cardType === "C" ? "Customer" : "";
    const viewContext = this.getView().getBindingContext() as Context | undefined;
    const seriesBinding = (this.byId("businessPartnerSeriesSelect") as Select)?.getBinding("items") as ODataListBinding;

    uiModel.setProperty("/docNumberManual", false);

    if (!transaction || !viewContext || !seriesBinding) {
      return;
    }

    seriesBinding.changeParameters({
      $filter: `TransactionCode eq '${transaction}' and Inactive eq false`
    });

    const info = (await this.getDocNumberInfoByTransaction(transaction)).find(x => x.Default);
    void viewContext.setProperty("CardCode", "");
    void viewContext.setProperty("DocNumberKey", info?.Key ?? null);
  }

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
