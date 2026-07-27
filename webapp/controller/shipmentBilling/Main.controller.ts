import Dialog from "sap/m/Dialog";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Table from "sap/ui/table/Table";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";
import MessageBox from "sap/m/MessageBox";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import Fragment from "sap/ui/core/Fragment";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import MessageToast from "sap/m/MessageToast";
import { SearchField$SearchEvent } from "sap/m/SearchField";

type BillingData = {
  ItemCode: string,
  ItemName: string,
  TruckDriverCode: string,
  TruckCode: string,
  Branch: {
    Code: string,
  }
}

/** Dados do formulário do diálogo de faturamento (model "viewModel"). */
type BillingForm = {
  InvoiceDate?: string,
  BranchCode?: string,
  Volume?: string | number,
  TruckingCompanyCode?: string,
  /** Só exibição — preenchido pelo value help, não vai no payload. */
  TruckingCompanyName?: string,
  TruckCode?: string,
  TaxPayerComments?: string,
  DeliveryCardCode?: string,
  /** Só exibição — preenchido pelo value help, não vai no payload. */
  DeliveryCardName?: string,
  ItemCode?: string,
  FreightTerms?: string,
  FreightCost?: number,
}

/** Liberação de entrega de venda selecionada, usada na montagem do documento de saída. */
type BilledRelease = {
  SalesShipmentReleaseKey?: string,
  SalesContractKey?: string,
  CardCode?: string,
  Price?: string | number,
  UnitOfMeasureCode?: string,
  AvailableQuantity?: string | number,
}

/** Romaneio selecionado, enviado como `SalesTransactions`. */
type BilledShipment = {
  Key?: string,
}

/**
 * @namespace siagrob1.controller.shipmentBilling
 */
export default class Main extends BaseController {

  formatter = formatter;

  private _billingDialog: Dialog;
  private _busyDialog: Dialog;
  /** Trava de reentrância do faturamento — ver `saveBillingDialog`. */
  private _billingInFlight = false;

  onInit(): void {
    // Liberações de venda disponíveis do dialog de faturamento: resultado da function
    // OData vai para um JSONModel (a resposta é array cru, sem envelope — mesmo padrão
    // de SelectShipmentRelease; bindar a table direto na function quebra o modelo V4).
    this.getView().setModel(new JSONModel([]), "releases");

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

    filters.push("TransactionType eq 'SalesShipment'");
    filters.push("TransactionStatus eq 'Confirmed'");

    if (query) {
      filters.push(`contains(TruckCode,'${query}')`);
    }
    
    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

    oBinding.changeParameters({
      $filter: filterParam
    });
  }

  async onDelete() {
    const table = this.byId("shipmentBillingTable") as Table;
    const selectedInvoices = table.getSelectedIndices();
    if (selectedInvoices.length < 1){
      MessageBox.warning("Selecione um registro.")
      throw new Error("Selecione um registro");
    }

    if (selectedInvoices.length > 1){
      MessageBox.warning("Selecione apenas um registro por vez.")
      throw new Error("Selecione apenas um registro por vez.");
    }

    if (await DialogHelper.confirmDialog("Estornar Embarque ?")) {
      const ctx = table.getContextByIndex(selectedInvoices[0]);
      const oModel = this.getModel() as ODataModel;
      const action = oModel.bindContext("/ShipmentBillingDeleteInvoice(...)");
      action.setParameter("Key", ctx.getProperty("Key"));
      
      this.setBusy(true);
      void action.invoke()
        .then(() => {
          this.refreshData();
          MessageToast.show("Embarque estornado com sucesso.")
        })
        .finally(() => this.setBusy(false));
    }
  }

  private async createBillingDialog() {
    const name = "siagrob1.view.shipmentBilling.fragments.Billing";
    const oView = this.getView();
    this._billingDialog = this.byId("billingDialog") as Dialog;

    if (!this._billingDialog) {
      this.setBusy(true);
      this._billingDialog = await Fragment.load({
        id: oView.getId(),
        name,
        controller: this
      }) as unknown as Dialog;
      oView.addDependent(this._billingDialog);
    }
    this.setBusy(false);
  }

  async openBillingDialog() {
    await this.createBillingDialog();

    const table = this.byId("shipmentBillingTable") as Table;
    const contractsTable = this.byId("shipmentBillingSalesContractsTable") as Table;
    const itemsSelected = table.getSelectedIndices();

    if (itemsSelected.length < 1) {
      MessageBox.warning("Selecione ao menos 1 item para faturamento.");
      throw new Error("Selecione ao menos 1 item para faturamento.");
    }

    if (this.hasTruckCodeInconsistency(itemsSelected)) {
      MessageBox.warning("Placas diferentes selecionadas.");
      return;
    }

    if (this.hasItemCodeInconsistency(itemsSelected)) {
      MessageBox.warning("Produtos diferentes selecionados.");
      return;
    }

    const viewModel = this.getModel("viewModel") as JSONModel;
    const transactions: BillingData[] = [];
    let totalVolume = 0;

    itemsSelected.forEach(i => {
      const ctx = table.getContextByIndex(i) as Context;
      totalVolume += +(ctx.getProperty("GrossWeight") as number);
      transactions.push(ctx.getObject() as BillingData);
    })

    console.log(transactions);

    viewModel.setData({
      ItemCode: transactions[0]?.ItemCode,
      ItemName: transactions[0]?.ItemName,
      Volume: totalVolume,
      GrossWeightLimit: 0,
      TruckDriverCode: transactions[0]?.TruckDriverCode,
      TruckCode: transactions[0]?.TruckCode,
      FreightTerms: "",
      BranchCode: transactions[0]?.Branch?.Code
    });

    // Lista as LIBERAÇÕES de venda disponíveis para o produto embarcado, recarregada a
    // cada abertura. Padrão bindContext + invoke + JSONModel (como SelectShipmentRelease):
    // a function retorna array cru, que vira a raiz do model "releases".
    contractsTable.clearSelection();
    await this.loadAvailableReleases(transactions[0]?.ItemCode ?? "");

    this._billingDialog?.open();
  }

  private async loadAvailableReleases(itemCode: string): Promise<void> {
    const model = this.getModel() as ODataModel;
    const func = model.bindContext("/SalesShipmentReleasesGetAvailable(...)");
    func.setParameter("ItemCode", itemCode);

    this.setBusy(true);
    try {
      await func.invoke();
      const releasesModel = this.getModel("releases") as JSONModel;
      releasesModel.setData(func.getBoundContext().getObject() as object);
    } finally {
      this.setBusy(false);
    }
  }

  private hasTruckCodeInconsistency(itemsSelected: number[]): boolean {
    const table = this.byId("shipmentBillingTable") as Table;

    const truckCodes: string[] = itemsSelected.map((i) => {
      const ctx = table.getContextByIndex(i);
      return ctx.getProperty("TruckCode") as string;
    });

    for (let i = 1; i < truckCodes.length; i++) {
      if (truckCodes[i] !== truckCodes[0]) {
        return true;
      }
    }

    return false;
  }

  private hasItemCodeInconsistency(itemsSelected: number[]): boolean {
    const table = this.byId("shipmentBillingTable") as Table;

    const itemCodes: string[] = itemsSelected.map((i) => {
      const ctx = table.getContextByIndex(i);
      return ctx.getProperty("ItemCode") as string;
    });

    for (let i = 1; i < itemCodes.length; i++) {
      if (itemCodes[i] !== itemCodes[0]) {
        return true;
      }
    }

    return false;
  }

  async saveBillingDialog() {
    // Trava de reentrância: precisa ser avaliada e setada ANTES do primeiro await, senão
    // um duplo clique em "Confirmar" enfileira dois MessageBox.confirm e dispara dois
    // faturamentos do mesmo carregamento (documento de saída duplicado, saldo do contrato
    // descontado duas vezes). O backend também recusa, mas aqui o usuário nem chega lá.
    if (this._billingInFlight) {
      return;
    }
    this._billingInFlight = true;

    try {
      if (!this.validateForm("shipmentBillingSalesContractsForm")) {
        MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
        return;
      }

      const shipments: BilledShipment[] = [];
      const shipmentBillingTable = this.byId("shipmentBillingTable") as Table;
      const selectedShipments = shipmentBillingTable.getSelectedIndices();

      selectedShipments.forEach(i => {
        const shipmentCtx = shipmentBillingTable.getContextByIndex(i);
        const shipmentObj = shipmentCtx.getObject() as BilledShipment;

        shipments.push({
          Key: shipmentObj?.Key
        });
      });


      const contractsTable = this.byId("shipmentBillingSalesContractsTable") as Table;
      const selectedContract = contractsTable.getSelectedIndices();
      if (selectedContract.length < 1) {
        MessageBox.error("Liberação de entrega não selecionada.");
        throw new Error("Liberação de entrega não selecionada.");
      }

      // Contexto do JSONModel "releases" (não OData) — getObject() devolve o DTO da function.
      const contractCtx = contractsTable.getContextByIndex(selectedContract[0]);

      if (contractCtx) {
        const model = this.getModel() as ODataModel;
        const viewModel = this.getModel("viewModel") as JSONModel;
        const release = contractCtx.getObject() as BilledRelease;
        const billing = viewModel.getData() as BillingForm;

        const confirm = await DialogHelper.confirmDialog("Confirma emissão do(s) Documento(s) de Saída ?");
        if (confirm) {

          const salesInvoice = {
            InvoiceDate: billing?.InvoiceDate,
            BranchCode: billing?.BranchCode,
            CardCode: release?.CardCode,
            GrossWeight: +billing?.Volume,
            NetWeight: +billing?.Volume,
            TruckingCompanyCode: billing?.TruckingCompanyCode,
            TruckCode: billing?.TruckCode,
            TaxPayerComments: billing?.TaxPayerComments,
            DeliveryCardCode: billing?.DeliveryCardCode,
            Items: [
              {
                ItemCode: billing?.ItemCode,
                Quantity: +billing?.Volume,
                UnitPrice: +release?.Price,
                UnitOfMeasureCode: release?.UnitOfMeasureCode,
                SalesContractKey: release?.SalesContractKey,
                SalesShipmentReleaseKey: release?.SalesShipmentReleaseKey
              }
            ],
            SalesTransactions: shipments,
            FreightTerms: billing?.FreightTerms,
            FreightCostStandard: billing?.FreightCost
          };

          this.closeBillingDialog();

          await this.createBusyDialog();
          this._busyDialog?.open();

          const action = model.bindContext("/ShipmentBillingCreateSalesInvoice(...)");
          action.setParameter("SalesInvoice", salesInvoice)
          try {
            await action.invoke();
            MessageToast.show("Documento(s) de saída criado(s) com sucesso.");
          } catch {
            // A mensagem técnica do backend já é exibida pelo handler global de mensagens
            // OData (Component.onMessageBindingChange).
          } finally {
            this._busyDialog?.close();
            // Refresh também no erro: se o romaneio já ficou vinculado, ele não pode
            // continuar sendo oferecido na lista para uma nova tentativa.
            this.refreshData();
          }
        }
      }
    } finally {
      this._billingInFlight = false;
    }
  }

  closeBillingDialog() {
    const oTable = this.byId("shipmentBillingTable") as Table;
    const oTableContracts = this.byId("shipmentBillingSalesContractsTable") as Table;
    oTable.clearSelection();
    oTableContracts.clearSelection();

    this._billingDialog.close();
  }

  private refreshData() {
    const oTable = this.byId("shipmentBillingTable") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }

  private async createBusyDialog() {
		if (!this._busyDialog) {
			this._busyDialog = await Fragment.load({
				name: "siagrob1.view.shipmentBilling.fragments.BusyDialog",
				controller: this,
			}) as unknown as Dialog;
			this.getView().addDependent(this._busyDialog);
		}
	}

}
