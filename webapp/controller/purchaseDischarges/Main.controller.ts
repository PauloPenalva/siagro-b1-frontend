import JSONModel from "sap/ui/model/json/JSONModel";
import MessageBox from "sap/m/MessageBox";
import Filter from "sap/ui/model/Filter";
import FilterOperator from "sap/ui/model/FilterOperator";
import Table from "sap/ui/table/Table";
import JSONListBinding from "sap/ui/model/json/JSONListBinding";
import CommonController from "../common/CommonController";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import { PurchaseDischarge } from "siagrob1/types/PurchaseDischarge";

type DischargeFilter = {
  DateFrom: string;
  DateTo: string;
  TransactionType: string;
  Supplier: string;
  ContractCode: string;
  LoadCode: string;
  ShowCancelled: boolean;
};

const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Troca nota: romaneios de quebra/sobra de descarga (tipos 16/17). Somente leitura — quem cria e
 * cancela é a Conferência de Entregas. O período vai ao servidor; o resto filtra no cliente.
 *
 * @namespace siagrob1.controller.purchaseDischarges
 */
export default class Main extends CommonController {

  onInit(): void {
    this.createFilterModel(Main.defaultFilter());
    this.getView().setModel(new JSONModel({ rows: [], count: 0, busy: false }), "discharges");

    this.getRouter().getRoute("purchaseDischarges")
      .attachPatternMatched(() => { void this.load(); });
  }

  /** Mês corrente até hoje; cancelados ocultos. Recriado a cada "Limpar". */
  private static defaultFilter(): DischargeFilter {
    const today = new Date();
    return {
      DateFrom: toIso(new Date(today.getFullYear(), today.getMonth(), 1)),
      DateTo: toIso(today),
      TransactionType: "",
      Supplier: "",
      ContractCode: "",
      LoadCode: "",
      ShowCancelled: false,
    };
  }

  onSearch(): void {
    void this.load();
  }

  onClearFilters(): void {
    this.createFilterModel(Main.defaultFilter());
    void this.load();
  }

  onOpenContract(): void {
    const table = this.byId("purchaseDischargesTable") as Table;
    const index = table.getSelectedIndex();
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    const row = index < 0 ? null : table.getContextByIndex(index)?.getObject() as PurchaseDischarge | undefined;

    if (!row?.PurchaseContractKey) {
      MessageBox.information("Selecione um romaneio com contrato de compra.");
      return;
    }

    this.navTo("purchaseContractsDetail", { id: row.PurchaseContractKey });
  }

  private filterData(): DischargeFilter {
    return (this.getModel("filter") as JSONModel).getData() as DischargeFilter;
  }

  private async load(): Promise<void> {
    const f = this.filterData();
    const model = this.getModel("discharges") as JSONModel;

    if (!f.DateFrom || !f.DateTo) {
      MessageBox.warning("Informe o período (Data de / Data até).");
      return;
    }

    model.setProperty("/busy", true);
    const result = await sendJson(
      "GET",
      `${this.api.purchaseDischargesList}(DateFrom='${f.DateFrom}',DateTo='${f.DateTo}')`);
    model.setProperty("/busy", false);

    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    model.setProperty("/rows", (result.data as PurchaseDischarge[] | undefined) ?? []);
    this.applyClientFilters();
  }

  private applyClientFilters(): void {
    const f = this.filterData();
    const filters: Filter[] = [];

    if (!f.ShowCancelled)
      filters.push(new Filter("Status", FilterOperator.NE, "Cancelled"));

    if (f.TransactionType)
      filters.push(new Filter("TransactionType", FilterOperator.EQ, f.TransactionType));

    if (f.Supplier)
      filters.push(new Filter({
        filters: [
          new Filter("SupplierCode", FilterOperator.Contains, f.Supplier),
          new Filter("SupplierName", FilterOperator.Contains, f.Supplier),
        ],
        and: false,
      }));

    if (f.ContractCode)
      filters.push(new Filter("PurchaseContractCode", FilterOperator.Contains, f.ContractCode));

    if (f.LoadCode)
      filters.push(new Filter("ShipmentLoadCode", FilterOperator.Contains, f.LoadCode));

    const binding = (this.byId("purchaseDischargesTable") as Table).getBinding("rows") as JSONListBinding;
    binding.filter(filters.length ? [new Filter({ filters, and: true })] : []);

    (this.getModel("discharges") as JSONModel).setProperty("/count", binding.getLength());
  }
}
