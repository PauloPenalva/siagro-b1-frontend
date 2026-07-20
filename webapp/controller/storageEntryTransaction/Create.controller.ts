import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import RequestModel from "siagrob1/model/RequestModel";
import { Route$PatternMatchedEvent } from "sap/ui/core/routing/Route";
import { QualityAttrib } from "siagrob1/types/QualityAttrib";

type routeArgs = {
  "?query": {
    shipmentReleaseKey: string
  }
}

/** Liberação de entrega lida com `$expand=PurchaseContract`. */
type ShipmentReleaseWithContract = {
  PurchaseContractKey?: string,
  DeliveryLocationCode?: string,
  DeliveryLocationName?: string,
  PurchaseContract?: {
    CardCode?: string,
    CardName?: string,
    ItemCode?: string,
    ItemName?: string,
    UnitOfMeasureCode?: string,
  },
}

type ODataCollection<T> = {
  value?: T[],
}

/** Dados montados no model "viewModel" e enviados na criação da entrada. */
type StorageEntryForm = {
  PurchaseContractKey?: string,
  StorageAddressCode?: string,
  StorageAddressDescription?: string,
  StorageTransaction?: {
    DocNumberKey?: string,
    BranchCode?: string,
    TransactionType?: string,
    CardCode?: string,
    CardName?: string,
    ItemCode?: string,
    ItemName?: string,
    UnitOfMeasureCode?: string,
    WarehouseCode?: string,
    WarehouseName?: string,
    TruckDriverCode?: string,
    TruckDriverName?: string,
    ShipmentReleaseKey?: string,
    QualityInspections?: { QualityAttribCode?: string, QualityAttribName?: string, Value: number }[],
  },
}

/** Retorno da action: os dois pesos, para avisar quando divergirem. */
type StorageEntryResult = {
  AllocatedVolume?: number,
  ReceiptNetWeight?: number,
}

/**
 * @namespace siagrob1.controller.storageEntryTransaction
 */
export default class Create extends BaseController {

  onInit(): void {
    this.getView().setModel(new JSONModel(), "lots");

    this.getRouter()
      .getRoute("storageEntryTransactionCreate")
      .attachPatternMatched((ev) => void this.routeMatched(ev));
  }

  private async routeMatched(ev: Route$PatternMatchedEvent) {
    const args = ev.getParameter("arguments") as routeArgs;
    const query = args["?query"];

    if (!query) {
      return;
    }

    const key = query?.shipmentReleaseKey;
    const requestModel = new RequestModel();

    let data: ShipmentReleaseWithContract;
    try {
      this.setBusy(true);
      data = await requestModel.get<ShipmentReleaseWithContract>(
        this.api.shipmentReleases + `(${key})?$expand=PurchaseContract`
      );
    } catch (error) {
      const err = error as JQueryXHR;
      MessageBox.error((err.responseJSON as { error?: { message?: string } })?.error?.message);
      return;
    } finally {
      this.setBusy(false);
    }

    let qualityAttribs: ODataCollection<QualityAttrib>;
    try {
      this.setBusy(true);
      qualityAttribs = await requestModel.get<ODataCollection<QualityAttrib>>(
        this.api.qualityAttrib + `?$orderby=Code&$filter=Disabled eq false`
      );
    } catch (error) {
      const err = error as JQueryXHR;
      MessageBox.error((err.responseJSON as { error?: { message?: string } })?.error?.message);
      return;
    } finally {
      this.setBusy(false);
    }

    const uiModel = this.getModel("ui") as JSONModel;
    uiModel.setProperty("/editable", true);

    this.clearStates("storageEntryTransactionForm");

    const viewModel = this.getModel("viewModel") as JSONModel;

    this.setBusy(true);
    try {
      const branchInfo = await this.getBranchInfo();
      const results = await this.getDocNumberInfoByTransaction("StorageTransaction");
      const docNumberInfo = results.filter(x => x.Default)[0];

      viewModel.setData({
        PurchaseContractKey: data?.PurchaseContractKey,
        StorageAddressCode: null,
        StorageAddressDescription: null,
        StorageTransaction: {
          DocNumberKey: docNumberInfo.Key,
          BranchCode: branchInfo.code,
          TransactionType: "Purchase",
          CardCode: data?.PurchaseContract?.CardCode,
          CardName: data?.PurchaseContract?.CardName,
          ItemCode: data?.PurchaseContract?.ItemCode,
          ItemName: data?.PurchaseContract?.ItemName,
          UnitOfMeasureCode: data?.PurchaseContract?.UnitOfMeasureCode,
          WarehouseCode: data?.DeliveryLocationCode,
          WarehouseName: data?.DeliveryLocationName,
          ShipmentReleaseKey: key,
          QualityInspections: qualityAttribs?.value?.map((x) => {
            return { QualityAttribCode: x.Code, QualityAttribName: x.Name, Value: 0 };
          }),
        }
      });
    } finally {
      this.setBusy(false);
    }
  }

  /** Value help do lote: filtra pelos lotes abertos do produto do contrato. */
  async onLotValueHelp() {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const itemCode = viewModel.getProperty("/StorageTransaction/ItemCode") as string;

    const aContexts = await this.openLotsDialog(itemCode);

    if (!aContexts.length) {
      return;
    }

    viewModel.setProperty("/StorageAddressCode", aContexts[0].getProperty("Code"));
    viewModel.setProperty("/StorageAddressDescription", aContexts[0].getProperty("Description"));
  }

  /**
   * Tira do payload os campos que existem só para exibição.
   *
   * A action recebe um `EntityParameter<StorageTransaction>`, e o OData rejeita
   * propriedade não declarada na entidade. `TruckDriverName` e `QualityAttribName`
   * alimentam campos de descrição da tela mas não existem no backend.
   */
  private toPayload(oStorageTransaction: StorageEntryForm["StorageTransaction"]) {
    if (!oStorageTransaction) {
      return oStorageTransaction;
    }

    const oPayload = { ...oStorageTransaction };
    delete oPayload.TruckDriverName;

    oPayload.QualityInspections = oPayload.QualityInspections?.map((oInspection) => {
      const oCopy = { ...oInspection };
      delete oCopy.QualityAttribName;
      return oCopy;
    });

    return oPayload;
  }

  async onSave() {
    if (!this.validateForm("storageEntryTransactionForm")) {
      MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
      return;
    }

    const viewModel = this.getModel("viewModel") as JSONModel;
    const viewData = viewModel.getData() as StorageEntryForm;

    if (!viewData?.StorageAddressCode) {
      MessageBox.warning("Selecione o lote de armazenagem que vai receber o produto.");
      return;
    }

    const oModel = this.getModel() as ODataModel;
    const action = oModel.bindContext("/StorageEntryTransactionsCreate(...)");
    action.setParameter("StorageTransaction", this.toPayload(viewData?.StorageTransaction));
    action.setParameter("PurchaseContractKey", viewData?.PurchaseContractKey);
    action.setParameter("StorageAddressCode", viewData?.StorageAddressCode);

    try {
      this.setBusy(true);
      await action.invoke();

      const result = action.getBoundContext()?.getObject() as StorageEntryResult;
      this.warnOnWeightDivergence(result);

      MessageToast.show("Entrada em armazenagem criada com sucesso.");
      this.navToList();
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * O Receipt recalcula os descontos com o ProcessingCost do LOTE, que pode
   * diferir do usado na compra. Quando isso acontece, o contrato é baixado por um
   * peso e o lote recebe outro — o usuário precisa saber, mas não é um erro.
   */
  private warnOnWeightDivergence(result: StorageEntryResult) {
    if (!result || result.AllocatedVolume === result.ReceiptNetWeight) {
      return;
    }

    MessageBox.warning(
      "Os pesos líquidos ficaram diferentes porque a tabela de custos do lote não é a " +
      "mesma da compra.\n\n" +
      `Baixado do contrato: ${result.AllocatedVolume}\n` +
      `Recebido no lote: ${result.ReceiptNetWeight}`
    );
  }

  onCancel() {
    this.onNavBack();
  }

  onNavToList() {
    this.navToList();
  }

  private navToList() {
    this.navTo("storageEntryTransaction");
  }
}
