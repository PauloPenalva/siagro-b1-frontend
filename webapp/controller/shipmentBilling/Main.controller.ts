import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import { SearchField$SearchEvent } from "sap/m/SearchField";
import ShipmentBillingDialog, { BillingLoad } from "siagrob1/helpers/ShipmentBillingDialog";

/**
 * @namespace siagrob1.controller.shipmentBilling
 */
export default class Main extends BaseController {

  formatter = formatter;

  private _billing: ShipmentBillingDialog;

  onInit(): void {
    // O diálogo de faturamento é compartilhado com o detalhe da carga; os modelos dele
    // (billing, billingReleases, billingBranches) são criados pelo helper.
    this._billing = new ShipmentBillingDialog({
      controller: this,
      view: this.getView(),
      setBusy: (busy) => this.setBusy(busy),
      validateForm: (formId) => this.validateForm(formId),
      registerTableLayouts: (root) => this.registerTableLayouts(root),
      isTaxCalculationActive: (branchCode) => this.isTaxCalculationActive(branchCode),
      onBilled: () => this.refreshData(),
      onClosed: () => (this.byId("shipmentBillingTable") as Table).clearSelection(),
    });

    this.getRouter().getRoute("shipmentBilling")
      .attachPatternMatched(() => this.applyFilters(null));
  }

  onSearch(ev: SearchField$SearchEvent) {
    this.applyFilters(ev);
  }

  private applyFilters(ev: SearchField$SearchEvent) {
    const query = ev?.getParameter("query");
    const oBinding = this.getView().byId("shipmentBillingTable").getBinding("rows") as ODataListBinding;
    const filters: string[] = [];

    // Pelo ENUM de status, não por `InvoicedQuantity lt TotalQuantity`: comparação
    // propriedade-a-propriedade é frágil e não indexável. Carga cancelada, carga apenas
    // planejada e carga totalmente faturada saem da worklist.
    //
    // `TotalQuantity gt 0` é cinto de segurança, não redundância: uma carga sem volume já
    // deveria estar em 'Planned', mas se a desvinculação um dia esquecer de rebaixá-la,
    // sobraria aqui uma carga 'Open' de volume zero oferecida para faturar. A cláusula de
    // volume torna esse esquecimento inofensivo.
    //
    // 'Returned' fica DE FORA de propósito, e não por esquecimento: é a carga recusada cuja
    // mercadoria voltou para um armazém. Ela tem saldo zero e o grão já está creditado em outro
    // lugar — oferecê-la aqui seria vender duas vezes o mesmo volume. A carga recusada que
    // SEGUE viagem volta para 'Open'/'PartiallyInvoiced' e reaparece por este mesmo filtro.
    // GAC-1175: a carga de REMOÇÃO não fatura — ela traz mercadoria para a armazenagem. Sem o
    // corte por tipo ela apareceria aqui em 'Open', com volume, como se estivesse a faturar.
    filters.push("LoadType eq 'Normal' and " +
      "(Status eq 'Open' or Status eq 'PartiallyInvoiced') and TotalQuantity gt 0");

    if (query) {
      filters.push(`(contains(Code,'${query}') or contains(TruckCode,'${query}'))`);
    }
    
    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    oBinding.changeParameters({
      $filter: filterParam
    });
  }

  // onDelete saiu daqui: o estorno do romaneio de embarque migrou para a Montagem de Carga,
  // que é o único lugar onde o romaneio ainda está solto — condição para poder estornar.

  async openBillingDialog() {
    const table = this.byId("shipmentBillingTable") as Table;
    const selected = table.getSelectedIndices();

    if (selected.length !== 1) {
      MessageBox.warning("Selecione uma carga para faturar.");
      return;
    }

    const load = (table.getContextByIndex(selected[0]) as Context).getObject() as BillingLoad;
    await this._billing.open(load);
  }

  saveBillingDialog() {
    return this._billing.save();
  }

  closeBillingDialog() {
    this._billing.close();
  }

  onBillingReleaseSelect() {
    return this._billing.onReleaseSelect();
  }

  private refreshData() {
    const oTable = this.byId("shipmentBillingTable") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }

}
