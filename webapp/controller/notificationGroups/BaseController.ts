import Table from "sap/ui/table/Table";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import AppBaseController from "../BaseController";

/**
 * Comportamento das coleções-filhas do grupo (membros e eventos assinados), compartilhado
 * entre as telas de inclusão e de edição. Espelha o padrão de users/BaseController.
 */
export abstract class BaseController extends AppBaseController {

  /**
   * Toda propriedade editável precisa entrar no create(), mesmo vazia: o ODataModel v4
   * recusa alterar propriedade que ainda não foi lida ("Must not change a property before
   * it has been read") e o erro só aparece quando a pessoa digita na célula.
   */
  onAddMember() {
    const oBinding = (this.byId("notificationGroupMembersTable") as Table)
      .getBinding("rows") as ODataListBinding;

    oBinding.create({ Name: "", Phone: "", Active: true }, false, true, false);
  }

  onRemoveMember() {
    this.removeSelectedRow("notificationGroupMembersTable");
  }

  onAddSubscription() {
    const oBinding = (this.byId("notificationGroupSubscriptionsTable") as Table)
      .getBinding("rows") as ODataListBinding;

    // Mesmo motivo do onAddMember. Os defaults também deixam a linha nova já válida,
    // em vez de dois Selects em branco.
    oBinding.create(
      { DocumentType: "PurchaseContract", EventType: "Created" }, false, true, false);
  }

  onRemoveSubscription() {
    this.removeSelectedRow("notificationGroupSubscriptionsTable");
  }

  private removeSelectedRow(tableId: string) {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId(tableId) as Table;
    const aSelectedIndices = oTable.getSelectedIndices();

    if (aSelectedIndices.length === 0) {
      MessageBox.alert("Selecione um item para remover.");
      return;
    }

    const oContext = oTable.getContextByIndex(aSelectedIndices[0]) as Context;

    void oContext.delete(oModel.getUpdateGroupId());
  }
}
