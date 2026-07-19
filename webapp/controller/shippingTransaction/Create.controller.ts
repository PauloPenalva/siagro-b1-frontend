 
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import RequestModel from "siagrob1/model/RequestModel";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import { QualityAttrib } from "siagrob1/types/QualityAttrib";
import MessageToast from "sap/m/MessageToast";

type routeArgs = {
  "?query": {
    shipmentReleaseKey: string
  }
}

/** Liberação de entrega lida com `$expand=PurchaseContract`. */
type ShipmentReleaseWithContract = {
  PurchaseContractKey?: string,
  DeliveryLocationCode?: string,
  PurchaseContract?: {
    CardCode?: string,
    ItemCode?: string,
    UnitOfMeasureCode?: string,
  },
}

/** Envelope de coleção OData retornado pelo endpoint REST. */
type ODataCollection<T> = {
  value?: T[],
}

/** Dados montados no model "viewModel" e enviados na criação do embarque. */
type ShippingTransactionForm = {
  PurchaseContractKey?: string,
  StorageTransaction?: {
    DocNumberKey?: string,
    BranchCode?: string,
    TransactionType?: string,
    CardCode?: string,
    ItemCode?: string,
    UnitOfMeasureCode?: string,
    WarehouseCode?: string,
    ShipmentReleaseKey?: string,
    QualityInspections?: { QualityAttribCode?: string, Value: number }[],
  },
}

/**
 * @namespace siagrob1.controller.shippingTransaction
 */
export default class Create extends BaseController {

  private _itemCode: string;

	onInit(): void  {
		this.getRouter().getRoute("shippingTransactionCreate").attachPatternMatched((ev) => void this.routeMatched(ev));
	}

	private async routeMatched(ev: Route$PatternMatchedEvent) {
    const args = ev.getParameter("arguments") as routeArgs;
    const query = args["?query"];

    if (query) {
      const key = query?.shipmentReleaseKey;

      const requestModel = new RequestModel();
      const shipmentServerUrl = this.api.shipmentReleases + `(${key})?$expand=PurchaseContract`

      let data: ShipmentReleaseWithContract;

      try {
        this.setBusy(true);
        data = await requestModel.get<ShipmentReleaseWithContract>(shipmentServerUrl);
      } catch (error) {
        const err = error as JQueryXHR;
        MessageBox.error((err.responseJSON as { error?: { message?: string } })?.error?.message);
        return;
      } finally {
        this.setBusy(false);
      }

      const qualityAttribServerUrl = this.api.qualityAttrib + `?$orderby=Code&$filter=Disabled eq false`
      let qualityAttribs: ODataCollection<QualityAttrib>;
      try {
        this.setBusy(true);
        qualityAttribs = await requestModel.get<ODataCollection<QualityAttrib>>(qualityAttribServerUrl)
      } catch (error) {
        const err = error as JQueryXHR;
        MessageBox.error((err.responseJSON as { error?: { message?: string } })?.error?.message);
        return;
      } finally {
        this.setBusy(false);
      }

      const uiModel = this.getModel("ui") as JSONModel;
      uiModel.setProperty("/editable", true);

      this.clearStates("shippingTransactionForm");

      const viewModel = this.getModel("viewModel") as JSONModel;

      this.setBusy(true);
      try {
        const branchInfo = await this.getBranchInfo();
        const results = await this.getDocNumberInfoByTransaction("StorageTransaction")
        const docNumberInfo = results.filter(x => x.Default)[0];

        viewModel.setData({
          PurchaseContractKey: data?.PurchaseContractKey,
          StorageTransaction: {
            DocNumberKey: docNumberInfo.Key,
            BranchCode: branchInfo.code,
            TransactionType: "Purchase",
            CardCode: data?.PurchaseContract?.CardCode,
            ItemCode: data?.PurchaseContract?.ItemCode,
            UnitOfMeasureCode: data?.PurchaseContract?.UnitOfMeasureCode,
            WarehouseCode: data?.DeliveryLocationCode,
            ShipmentReleaseKey: key,
            QualityInspections: qualityAttribs?.value?.map((x) => {
              return { QualityAttribCode: x.Code, Value: 0 }
            }),
          }
        });
        
        this._itemCode = data?.PurchaseContract?.ItemCode;

        return;
      } finally {
        this.setBusy(false);
      }
     
    }
	
	}

	async onSave() {
    if (!this.validateForm("shippingTransactionForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }
    
    const oModel = this.getModel() as ODataModel;
    const viewModel = this.getModel("viewModel") as JSONModel;
    const viewData = viewModel.getData() as ShippingTransactionForm;

    const action = oModel.bindContext("/ShippingTransactionsCreate(...)");
    action.setParameter("StorageTransaction", viewData?.StorageTransaction);
    action.setParameter("PurchaseContractKey", viewData?.PurchaseContractKey);

		try {
			this.setBusy(true);
			await action.invoke();
      MessageToast.show("Embarque criado com sucesso.");
      this.navToShippingTransaction(viewData?.StorageTransaction?.ItemCode);
		} finally {
			this.setBusy(false);
		}
	}

	onCancel() {
    this.onNavBack();
	}

  onNavToShippingTransaction() {
    this.navToShippingTransaction(this._itemCode);
  }

  private navToShippingTransaction(itemCode: string) {
     this.navTo("shippingTransaction",{
        "?query":{ itemCode }
      })
  }
}
