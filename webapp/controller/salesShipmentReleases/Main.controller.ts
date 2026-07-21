import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import Table, { Table$RowSelectionChangeEvent } from "sap/ui/table/Table";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";

import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import MessageToast from "sap/m/MessageToast";

/**
 * @namespace siagrob1.controller.salesShipmentReleases
 */
export default class Main extends BaseController {

  formatter = formatter;

  onInit(): void {
    this.createFilterModel();
    this.getView().setModel(new JSONModel({ canCancel: false }), "selection");

    this.getRouter().getRoute("salesShipmentReleases")
      .attachPatternMatched(() => this.applyFilters());
  }

  /**
   * Só permite cancelar quando a liberação ainda tem saldo a devolver ao contrato.
   * Sem saldo, a ação correta é Finalizar (o backend também recusa).
   */
  onRowSelectionChange(oEvent: Table$RowSelectionChangeEvent): void {
    const oContext = oEvent.getParameter("rowContext") as Context;
    const balance = oContext ? Number(oContext.getProperty("AvailableQuantity")) : 0;

    this.setCanCancel(balance > 0);
  }

  private setCanCancel(value: boolean): void {
    (this.getView().getModel("selection") as JSONModel).setProperty("/canCancel", value);
  }

  onDetail(): void {
    const oTable = this.byId("tableSalesShipmentReleases") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    if (oContext) {
      this.navTo("salesShipmentReleasesDetail", { id: oContext.getProperty("Key") as string });
    }
  }

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  onSearch(): void {
    this.applyFilters();
  }

  private applyFilters() {
    const oBinding = this.getView().byId("tableSalesShipmentReleases").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as Record<string, string>;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      const filterKey = key;
      const value = filterData[filterKey];

      if (!value) return;

      if (filterKey == "Status") {
        filters.push(`${filterKey} eq '${value}'`);
      } else if (filterKey == "MarketType") {
        filters.push(`SalesContract/MarketType eq '${value}'`);
      } else if (filterKey == "ReleaseDateFrom") {
        filters.push(`ReleaseDate ge ${value}`);
      } else if (filterKey == "ReleaseDateTo") {
        filters.push(`ReleaseDate le ${value}`);
      } else if (filterKey == "DeliveryEndDateFrom") {
        filters.push(`SalesContract/DeliveryEndDate ge ${value}`);
      } else if (filterKey == "DeliveryEndDateTo") {
        filters.push(`SalesContract/DeliveryEndDate le ${value}`);
      } else if (filterKey == "StandardCashFlowDateFrom") {
        filters.push(`SalesContract/StandardCashFlowDate ge ${value}`);
      } else if (filterKey == "StandardCashFlowDateTo") {
        filters.push(`SalesContract/StandardCashFlowDate le ${value}`);
      } else if (filterKey == "Code") {
        filters.push(`contains(SalesContract/Code,'${value}')`);
      } else if (filterKey == "CardCode") {
        filters.push(`contains(SalesContract/CardCode,'${value}')`);
      } else if (filterKey == "ItemCode") {
        filters.push(`contains(SalesContract/ItemCode,'${value}')`);
      } else {
        filters.push(`contains(${filterKey},'${value}')`);
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    oBinding.changeParameters({
      $filter: filterParam
    });
  }

  async onActivate() {
    const oTable = this.byId("tableSalesShipmentReleases") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    if (oContext) {
      const sId = oContext.getProperty("Key") as string;

      if (await DialogHelper.confirmDialog("Ativar entrega ?")) {
        const model = this.getModel() as ODataModel;
        const action = model.bindContext("/SalesShipmentReleasesApprovation(...)");
        action.setParameter("Key", sId);

        this.setBusy(true);
        void action.invoke()
          .then(() => {
            MessageToast.show("Liberação ativada com sucesso.");
            this.refreshData();
          })
          .finally(() => this.setBusy(false));
      }
      return;
    }

    MessageBox.warning("Selecione um registro.");
  }

  async onPause() {
    const oTable = this.byId("tableSalesShipmentReleases") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    if (oContext) {
      const sId = oContext.getProperty("Key") as string;

      if (await DialogHelper.confirmDialog("Pausar entrega ?")) {
        const model = this.getModel() as ODataModel;
        const action = model.bindContext("/SalesShipmentReleasesPause(...)");
        action.setParameter("Key", sId);

        this.setBusy(true);
        void action.invoke()
          .then(() => {
            MessageToast.show("Liberação pausada com sucesso.");
            this.refreshData();
          })
          .finally(() => this.setBusy(false));
      }
      return;
    }

    MessageBox.warning("Selecione um registro.");
  }

  async onCancel() {
    const oTable = this.byId("tableSalesShipmentReleases") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    if (oContext) {
      const sId = oContext.getProperty("Key") as string;

      const sReason = await DialogHelper.promptDialog(
        "Cancelar liberação de entrega",
        "Informe o motivo do cancelamento",
        "Ex.: troca de armazém de entrega"
      );

      if (sReason) {
        const model = this.getModel() as ODataModel;
        const action = model.bindContext("/SalesShipmentReleasesCancelation(...)");
        action.setParameter("Key", sId);
        action.setParameter("CancellationReason", sReason);

        this.setBusy(true);
        void action.invoke()
          .then(() => {
            MessageToast.show("Liberação cancelada com sucesso.");
            this.setCanCancel(false);
            this.refreshData();
          })
          .finally(() => this.setBusy(false));
      }
      return;
    }

    MessageBox.warning("Selecione um registro.");
  }

  async onFinalize() {
    const oTable = this.byId("tableSalesShipmentReleases") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    if (!oContext) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const sId = oContext.getProperty("Key") as string;

    if (await DialogHelper.confirmDialog("Finalizar entrega ? Após finalizada não será possível faturar.")) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/SalesShipmentReleasesClose(...)");
      action.setParameter("Key", sId);

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Liberação finalizada com sucesso.");
          this.refreshData();
        })
        .finally(() => this.setBusy(false));
    }
  }

  async onReopen() {
    const oTable = this.byId("tableSalesShipmentReleases") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    if (!oContext) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const sId = oContext.getProperty("Key") as string;

    if (await DialogHelper.confirmDialog("Reabrir entrega ? Ela voltará a aceitar faturamento.")) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/SalesShipmentReleasesReopen(...)");
      action.setParameter("Key", sId);

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          MessageToast.show("Liberação reaberta com sucesso.");
          this.refreshData();
        })
        .finally(() => this.setBusy(false));
    }
  }

  async onRecalculate() {
    const oTable = this.byId("tableSalesShipmentReleases") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const oContext = oTable.getContextByIndex(i);
    if (!oContext) {
      MessageBox.warning("Selecione um registro.");
      return;
    }

    const sId = oContext.getProperty("Key") as string;

    if (await DialogHelper.confirmDialog("Recalcular o saldo desta liberação a partir dos romaneios ?")) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/SalesShipmentReleasesRecalculateBalance(...)");
      action.setParameter("Key", sId);

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          const result = action.getBoundContext().getObject() as {
            Changed?: boolean; PreviousAvailableQuantity?: number; NewAvailableQuantity?: number;
          };
          const fmt = (v?: number) =>
            Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

          if (result?.Changed) {
            MessageBox.information(
              `Saldo recalculado.\n\nDisponível: ${fmt(result.PreviousAvailableQuantity)} → ${fmt(result.NewAvailableQuantity)}`
            );
          } else {
            MessageToast.show("Saldo já estava correto.");
          }
          this.refreshData();
        })
        .finally(() => this.setBusy(false));
    }
  }

  async onRecalculateAll() {
    if (await DialogHelper.confirmDialog("Recalcular o saldo de todas as liberações não finalizadas ?")) {
      const model = this.getModel() as ODataModel;
      const action = model.bindContext("/SalesShipmentReleasesRecalculateAllBalances(...)");

      this.setBusy(true);
      void action.invoke()
        .then(() => {
          const result = action.getBoundContext().getObject() as { Scanned?: number; Changed?: number };
          MessageBox.information(
            `Recálculo concluído.\n\nAvaliadas: ${result?.Scanned ?? 0}\nCorrigidas: ${result?.Changed ?? 0}`
          );
          this.refreshData();
        })
        .finally(() => this.setBusy(false));
    }
  }

  async onDelete() {
    const oModel = this.getView().getModel() as ODataModel;
    const oTable = this.byId("tableSalesShipmentReleases") as Table;

    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um registro.");
      return;
    }
    const oBindingContext = oTable.getContextByIndex(i) as Context;

    if (await confirmDialog("Deseja realmente deletar este registro ?", "Deletar registro ?")) {
      try {
        this.setBusy(true);

        await oBindingContext.delete("$auto");

        await oModel.submitBatch(oModel.getUpdateGroupId());
      } finally {
        this.setBusy(false);
      }
    }
  }

  private refreshData() {
    const oTable = this.byId("tableSalesShipmentReleases") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }

}
