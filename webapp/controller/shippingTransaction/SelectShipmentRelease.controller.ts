

import { BaseController } from "./BaseController";

import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { filterReleasesBySupplier, ReleaseRow } from "siagrob1/helpers/ShippingSupplierSummaryHelpers";

type routeArgs = {
  "?query": { 
    itemCode: string ,
    warehouseCode: string,
    // GAC-1224: grupo escolhido na Seleção de Fornecedor. Sem cardCode (link antigo) a tela
    // lista tudo; com cardCode e sem cashFlowDate, lista as liberações SEM previsão.
    cardCode?: string,
    cashFlowDate?: string,
  }
}

/**
 * @namespace siagrob1.controller.shippingTransaction
 */
export default class SelectShipmentRelease extends BaseController {

  private _itemCode: string;
  private _warehouseCode: string;
  private _cardCode: string;
  private _cashFlowDate: string;
  
	onInit(): void  {

    const jsonModel = new JSONModel();
    this.getView().setModel(jsonModel, "contracts");

    this.getRouter()
			.getRoute("selectShipmentRelease")
			.attachPatternMatched((ev) => this.onRouteMatched(ev), this);
	}

  private onRouteMatched(ev: Route$PatternMatchedEvent) {
    const args = ev.getParameter("arguments") as routeArgs;
    
    const query = args["?query"];
    
		if (query) {
      const itemCode = query?.itemCode;
      const warehouseCode = query?.warehouseCode;
      
      this._itemCode = itemCode;
      this._warehouseCode = warehouseCode;
      this._cardCode = query?.cardCode;
      this._cashFlowDate = query?.cashFlowDate;

      // A view sobrevive entre visitas: limpa a seleção e as linhas do grupo anterior.
      this.clearRowSelection("tableSelectShipmentRelease");
      (this.getModel("contracts") as JSONModel).setData([]);
      
      if (itemCode) {
        void this.getPurchaseContracts(itemCode, warehouseCode)	
      }

      return;
    }
	}

  onCreateShippingTransaction() {
    const oContext = this.getSelectedRowContext("tableSelectShipmentRelease");
    
    if (!oContext) {
      MessageBox.warning("Selecione um item na tabela.");
      return;
    }

		const key = oContext.getProperty("ShipmentReleaseKey") as string;

    this.navTo("shippingTransactionCreate",{
        "?query":{ shipmentReleaseKey: key }
    })
  }

  onCancel() {
    // Veio da Seleção de Fornecedor: volta para ela, e não direto para a lista de armazéns.
    if (this._itemCode && this._cardCode) {
      this.navTo("selectShippingSupplier",{
        "?query":{ itemCode: this._itemCode, warehouseCode: this._warehouseCode }
      })
      return;
    }

    if (this._itemCode) {
      this.navTo("shippingTransaction",{
        "?query":{ itemCode: this._itemCode }
      })
      return;
    }

    this.onNavBack();
  }

  private async getPurchaseContracts(itemCode: string, warehouseCode: string) {
      const model = this.getModel() as ODataModel;
      const func = model.bindContext("/ShipmentReleasesGetPurchaseContracts(...)");
      func.setParameter("ItemCode", itemCode);
      func.setParameter("WarehouseCode", warehouseCode);
  
      this.setBusy(true);
      
      try {
        await func.invoke();
        const result = func.getBoundContext().getObject() as { value?: ReleaseRow[] } | ReleaseRow[];
        const rows = Array.isArray(result) ? result : result?.value;
        const viewModel = this.getModel("contracts") as JSONModel
        viewModel.setData(filterReleasesBySupplier(rows, this._cardCode, this._cashFlowDate));
      } finally {
        this.setBusy(false);
      }
    }
}
