import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";

import Table from 'sap/m/Table';
import IconTabBar from 'sap/m/IconTabBar';
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import MessageBox from "sap/m/MessageBox";

type EntryFilter = {
  StorageAddressCode?: string,
  PurchaseContractCode?: string,
  StorageTransactionCode?: string,
}

/**
 * Lista das entradas em armazenagem própria, separadas por situação.
 *
 * @namespace siagrob1.controller.storageEntryTransaction
 */
export default class Main extends BaseController {

  onInit(): void {
    this.createFilterModel();

    this.getRouter()
      .getRoute("storageEntryTransaction")
      .attachPatternMatched(() => this.applyFilters(), this);
  }

  /** Troca de aba (Confirmadas/Canceladas) reaplica o filtro completo. */
  onTabSelect() {
    this.applyFilters();
  }

  onSearch() {
    this.applyFilters();
  }

  /**
   * Monta um único $filter combinando a aba de situação com os três campos de
   * busca. Segue o idiom do projeto: string OData via changeParameters, e não
   * binding.filter() — os dois não convivem no mesmo binding.
   */
  private applyFilters() {
    const table = this.byId("tableStorageEntries") as Table;
    const binding = table?.getBinding("items") as ODataListBinding;

    if (!binding) return;

    const tab = this.byId("storageEntriesIconTabBar") as IconTabBar;
    const status = tab?.getSelectedKey() || "Confirmed";

    const filterModel = this.getModel("filter") as JSONModel;
    const f = (filterModel?.getData() || {}) as EntryFilter;

    // Literal simples: o parser aceita e não amarra a tela ao namespace do schema
    // (qualificar exigiria "SIAGROB1.StorageEntryTransactionStatus'...'").
    const parts = [`Status eq '${status}'`];

    if (f.StorageAddressCode?.trim()) {
      parts.push(`contains(StorageAddressCode,'${this.escape(f.StorageAddressCode)}')`);
    }

    // Filtros sobre navegação para-um: o OData V4 aceita o caminho direto.
    if (f.PurchaseContractCode?.trim()) {
      parts.push(`contains(PurchaseContract/Code,'${this.escape(f.PurchaseContractCode)}')`);
    }

    if (f.StorageTransactionCode?.trim()) {
      parts.push(`contains(PurchaseStorageTransaction/Code,'${this.escape(f.StorageTransactionCode)}')`);
    }

    binding.changeParameters({ $filter: parts.join(" and ") });
  }

  /** Aspas simples são escapadas dobrando, conforme a gramática do OData. */
  private escape(value: string) {
    return value.trim().replace(/'/g, "''");
  }

  onCreate() {
    this.navTo("storageEntryTransactionSelectWarehouse");
  }

  onRefresh() {
    const table = this.byId("tableStorageEntries") as Table;
    const binding = table?.getBinding("items") as ODataListBinding;
    binding?.refresh();
  }

  /**
   * Abre o detalhe da entrada selecionada. O estorno vive lá: é uma operação
   * destrutiva e o usuário precisa ver o par de romaneios antes de disparar.
   */
  onDetail() {
    const oTable = this.byId("tableStorageEntries") as Table;
    const oContext = oTable.getSelectedItem()?.getBindingContext();

    if (!oContext) {
      MessageBox.warning("Selecione uma entrada na tabela.");
      return;
    }

    this.navTo("storageEntryTransactionDetail", {
      id: oContext.getProperty("Key") as string
    });
  }
}
