import { BaseController } from "./BaseController";

import List from "sap/m/List";
import MessageBox from "sap/m/MessageBox";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import {
  ReleaseRow,
  summarizeReleasesBySupplier,
  SupplierSummaryRow,
} from "siagrob1/helpers/ShippingSupplierSummaryHelpers";

type routeArgs = {
  "?query": {
    itemCode: string,
    warehouseCode: string,
  }
}

/**
 * Seleção de Fornecedor da Expedição de Grãos (GAC-1224): resume as liberações com saldo do
 * armazém por fornecedor + previsão de pagamento, para que a Seleção de Liberação abra só com
 * as liberações do grupo escolhido.
 *
 * @namespace siagrob1.controller.shippingTransaction
 */
export default class SelectSupplier extends BaseController {

  private _itemCode: string;
  private _warehouseCode: string;

  onInit(): void {
    this.getView().setModel(new JSONModel([]), "suppliers");

    this.getRouter()
      .getRoute("selectShippingSupplier")
      .attachPatternMatched((ev) => this.onRouteMatched(ev), this);
  }

  private onRouteMatched(ev: Route$PatternMatchedEvent) {
    const args = ev.getParameter("arguments") as routeArgs;
    const query = args["?query"];

    this._itemCode = query?.itemCode;
    this._warehouseCode = query?.warehouseCode;

    // A view sobrevive entre visitas: sem limpar, a seleção e as linhas do armazém anterior
    // apareceriam enquanto a consulta nova não volta.
    (this.byId("tableSelectShippingSupplier") as List).removeSelections(true);
    (this.getModel("suppliers") as JSONModel).setData([]);

    if (this._itemCode) {
      void this.loadSuppliers(this._itemCode, this._warehouseCode);
    }
  }

  onSelectSupplier() {
    const table = this.byId("tableSelectShippingSupplier") as List;
    const context = table.getSelectedItem()?.getBindingContext("suppliers");

    if (!context) {
      MessageBox.warning("Selecione um item na tabela.");
      return;
    }

    const supplier = context.getObject() as SupplierSummaryRow;

    const query: Record<string, string> = {
      itemCode: this._itemCode,
      warehouseCode: this._warehouseCode,
      cardCode: supplier.FCode,
    };

    // Grupo sem previsão de pagamento vai sem o parâmetro: é assim que a tela seguinte
    // distingue "sem data" de uma data específica.
    if (supplier.CashFlowDateKey) {
      query.cashFlowDate = supplier.CashFlowDateKey;
    }

    this.navTo("selectShipmentRelease", { "?query": query });
  }

  onCancel() {
    if (this._itemCode) {
      this.navTo("shippingTransaction", {
        "?query": { itemCode: this._itemCode }
      });
      return;
    }

    this.onNavBack();
  }

  private async loadSuppliers(itemCode: string, warehouseCode: string) {
    const model = this.getModel() as ODataModel;
    const func = model.bindContext("/ShipmentReleasesGetPurchaseContracts(...)");
    func.setParameter("ItemCode", itemCode);
    func.setParameter("WarehouseCode", warehouseCode);

    this.setBusy(true);

    try {
      await func.invoke();
      const result = func.getBoundContext().getObject() as { value?: ReleaseRow[] } | ReleaseRow[];
      const rows = Array.isArray(result) ? result : result?.value;

      (this.getModel("suppliers") as JSONModel).setData(summarizeReleasesBySupplier(rows));
    } finally {
      this.setBusy(false);
    }
  }
}
