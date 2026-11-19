import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";
import JSONModel from "sap/ui/model/json/JSONModel";
import Table from "sap/ui/table/Table";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import { anyOfFilter } from "siagrob1/helpers/FilterHelpers";

/** Status marcados ao abrir a tela e ao limpar os filtros: todos, menos Cancelado. */
const DEFAULT_STATUSES = ["Waiting", "Processing", "Complete"];

/**
 * @namespace siagrob1.controller.weighingTicket.completed
 */
export default class Main extends BaseController {

  formatter = formatter;

  onInit() {
    this.createFilterModel({ Status: DEFAULT_STATUSES });

    this.getRouter().getRoute("weighingTicketsCompleted")
      .attachPatternMatched(() => this.applyFilters())
  }

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  onSearch(): void {
    this.applyFilters()
  }


  private applyFilters() {
    const oBinding = this.getView().byId("tableWeighingTicketsCompleted").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as Record<string, string>;
    // Status é de múltipla seleção (array): entra como um grupo de `or`, fora do laço dos demais campos.
    const filters: string[] = [
      anyOfFilter("Status", filterModel.getProperty("/Status") as string[]),
    ].filter(Boolean);

    Object.keys(filterData).forEach((key: string) => {
      const value = filterData[key];

      if (!value || key == "Status") return;

      if (key == "Type") {
        filters.push(`${key} eq '${value}'`);
      } else if (key == "DateFrom") {
        filters.push(`Date ge ${value}`);
      } else if (key == "DateTo") {
        filters.push(`Date le ${value}`);
      } else {
        filters.push(`contains(${key},'${value}')`);
      }
    });

    // Entre parênteses: o `or` solto capturaria os demais filtros unidos por `and`.
    filters.push("(Stage eq 'Completed' or Stage eq 'ReadyForCompleting')");

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    oBinding.changeParameters({
      $filter: filterParam
    });
  }



  async printTicket(): Promise<void> {
    const oTable = this.byId("tableWeighingTicketsCompleted") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.alert("Selecione um item para imprimir.");
      return;
    }

    const oContext = oTable.getContextByIndex(i) as Context;

    const key = oContext.getProperty("Key") as string;

    try {

      this.setBusy(true);

      const response = await fetch(`/reports/WeighingTicket/${key}/print`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
      });

      if (!response.ok) {
        throw new Error("Falha ao gerar relatório.");
      }

      const blob = await response.blob();
      const fileURL = URL.createObjectURL(blob);

      // abre em nova aba
      window.open(fileURL, "_blank");

      // opcional: liberar memória depois de um tempo
      setTimeout(() => URL.revokeObjectURL(fileURL), 60000);

    } catch (error) {
      const err = error as Error;
      MessageBox.error(err?.message);
    } finally {
      this.setBusy(false);
    }
  }



  onDetail(): void {
    const oTable = this.byId("tableWeighingTicketsCompleted") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
    const sId = oContext.getProperty("Key") as string;

    this.navTo("weighingTicketsCompletedDetail", { id: sId });
  }


}
