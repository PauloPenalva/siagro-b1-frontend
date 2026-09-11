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

    // Mesmo motivo do onAddMember: as duas propriedades entram, mas nulas, para a linha
    // nascer sem opção pré-selecionada. Como os enums não são anuláveis no servidor,
    // validateSubscriptions() barra o salvar enquanto alguma linha estiver em branco.
    oBinding.create({ DocumentType: null, EventType: null }, false, true, false);
  }

  /**
   * Linha de evento sem documento ou sem evento vira 400 genérico no POST (enum não
   * anulável). Varre todos os contextos, não só as linhas visíveis da tabela.
   */
  protected validateSubscriptions(): boolean {
    const oBinding = (this.byId("notificationGroupSubscriptionsTable") as Table)
      .getBinding("rows") as ODataListBinding;

    const bAllFilled = oBinding.getAllCurrentContexts().every((oContext) =>
      !!oContext.getProperty("DocumentType") && !!oContext.getProperty("EventType"));

    if (!bAllFilled) {
      MessageBox.warning("Selecione o documento e o evento em todas as linhas da aba Eventos.");
    }

    return bAllFilled;
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
