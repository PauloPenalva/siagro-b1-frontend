import { SearchField$SearchEvent } from "sap/m/SearchField";
import BaseController from "../BaseController";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import Select from "sap/m/Select";
import Panel from "sap/m/Panel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import formatter from "siagrob1/model/formatter";
import ServerRoutes from "siagrob1/model/ServerRoutes";

/**
 * @namespace siagrob1.controller.notificationLogs
 */
export default class Main extends BaseController {
  formatter = formatter;

  onInit(): void {
    this.getRouter().getRoute("notificationLogs")
      .attachPatternMatched(() => this.routeMatched());

    // Ao trocar a linha selecionada, a tabela de envios passa a apontar para as entregas
    // daquela notificação.
    (this.byId("tableNotificationLogs") as Table)
      .attachRowSelectionChange(() => this.bindDeliveries());
  }

  private routeMatched() {
    this.onRefresh();
  }

  onRefresh(): void {
    (this.byId("tableNotificationLogs").getBinding("rows") as ODataListBinding).refresh();
  }

  private bindDeliveries() {
    const oTable = this.byId("tableNotificationLogs") as Table;
    const i = oTable.getSelectedIndex();
    const oDeliveries = this.byId("notificationDeliveriesTable") as Table;

    if (i < 0) {
      oDeliveries.unbindRows();
      oDeliveries.setNoData("Selecione uma notificação acima para ver os envios.");
      (this.byId("deliveriesPanel") as Panel).setHeaderText("Envios");
      return;
    }

    // Com uma linha selecionada, "selecione uma notificação" passaria a mentir: o que a
    // ausência de linhas significa aqui é que nada chegou a ser enviado (evento sem grupo
    // assinante, ou envio desligado).
    oDeliveries.setNoData("Nenhum envio registrado para esta notificação.");

    const oContext = oTable.getContextByIndex(i) as Context;
    const code = oContext.getProperty("DocumentCode") as string;

    oDeliveries.bindRows({ path: `${oContext.getPath()}/Deliveries` });

    // Título do painel diz de QUAL notificação são os envios listados — sem isso, com a
    // tabela de cima rolada, não dá para saber a que a lista de baixo se refere.
    (this.byId("deliveriesPanel") as Panel).setHeaderText(
      code ? `Envios — documento ${code}` : "Envios");
  }

  onSearch(ev: SearchField$SearchEvent): void {
    const query = ev.getParameter("query");

    (this.byId("tableNotificationLogs").getBinding("rows") as ODataListBinding)
      .filter([new Filter("DocumentCode", FilterOperator.Contains, query)]);
  }

  /**
   * Filtro por situação.
   *
   * Vai por `$filter` cru, e não por `sap.ui.model.Filter`: o `ODataMetaModel` do v4 não tem
   * tipo de UI5 para enum, então formatar o literal estoura com
   * "Unsupported type: SIAGROB1.NotificationOutboxStatus". O servidor aceita o nome do membro
   * entre aspas simples.
   *
   * `changeParameters` combina com o `filter()` da busca por documento — os dois são
   * aplicados juntos, não se sobrescrevem.
   */
  onFilterStatus(): void {
    const key = (this.byId("statusFilter") as Select).getSelectedKey();
    const oBinding = this.byId("tableNotificationLogs").getBinding("rows") as ODataListBinding;

    oBinding.changeParameters({ $filter: key ? `Status eq '${key}'` : undefined });
  }

  async onResend() {
    const oTable = this.byId("tableNotificationLogs") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.alert("Selecione uma notificação para reenviar.");
      return;
    }

    const key = (oTable.getContextByIndex(i) as Context).getProperty("Key") as string;

    this.setBusy(true);

    try {
      const oModel = this.getView().getModel() as ODataModel;
      const boundAction = oModel.bindContext(ServerRoutes.notificationOutboxResend);
      boundAction.setParameter("Key", key);

      await boundAction.invoke();

      // O envio é assíncrono: volta para pendente e o job processa em seguida. Dizer
      // "reenviada" aqui daria a impressão errada de que já chegou.
      MessageToast.show("Notificação recolocada na fila de envio.");
      this.onRefresh();
    } catch (err) {
      MessageBox.error((err as Error).message ?? "Erro ao reenviar a notificação.");
    } finally {
      this.setBusy(false);
    }
  }
}
