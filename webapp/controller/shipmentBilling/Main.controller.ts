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

/** Carga selecionada na lista — a origem do faturamento agora. */
type LoadData = {
  Key: string,
  Code: string,
  ItemCode: string,
  ItemName: string,
  TruckDriverCode: string,
  TruckCode: string,
  BranchCode: string,
  AvailableQuantity: number,
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
  /** Chave da carga faturada — substitui `SalesTransactions` no payload. */
  ShipmentLoadKey?: string,
  ShipmentLoadCode?: string,
  /** Saldo da carga no momento da abertura, limite da quantidade a faturar. */
  AvailableQuantity?: number,
  /** Escape do filtro de saldo do contrato na lista de liberações. */
  IncludeContractsWithoutBalance?: boolean,
}

/** Liberação de entrega de venda selecionada, usada na montagem do documento de saída. */
type BilledRelease = {
  SalesShipmentReleaseKey?: string,
  SalesContractKey?: string,
  CardCode?: string,
  Price?: string | number,
  UnitOfMeasureCode?: string,
  AvailableQuantity?: string | number,
  /** Só exibição — preço em KG convertido pra UoM comercial do item, quando configurada. */
  CommercialPrice?: string | number,
  /** Só exibição — acompanha CommercialPrice. */
  CommercialUnitOfMeasureCode?: string,
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

    // Pelo ENUM de status, não por `InvoicedQuantity lt TotalQuantity`: comparação
    // propriedade-a-propriedade é frágil e não indexável. Carga cancelada e carga totalmente
    // faturada saem da worklist.
    filters.push("(Status eq 'Open' or Status eq 'PartiallyInvoiced')");

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
    const selected = table.getSelectedIndices();

    // UMA carga: a aglutinação já foi decidida na Montagem, e por isso as duas checagens de
    // consistência (placa e produto) saíram daqui — a carga é homogênea por construção.
    if (selected.length !== 1) {
      MessageBox.warning("Selecione uma carga para faturar.");
      return;
    }

    const load = (table.getContextByIndex(selected[0]) as Context).getObject() as LoadData;

    if (!(load.AvailableQuantity > 0)) {
      MessageBox.warning("Carga sem saldo a faturar.");
      return;
    }

    const viewModel = this.getModel("viewModel") as JSONModel;

    viewModel.setData({
      ItemCode: load.ItemCode,
      ItemName: load.ItemName,
      // Sugere o saldo inteiro; o usuário reduz para faturar em partes.
      Volume: load.AvailableQuantity,
      AvailableQuantity: load.AvailableQuantity,
      ShipmentLoadKey: load.Key,
      ShipmentLoadCode: load.Code,
      TruckDriverCode: load.TruckDriverCode,
      TruckCode: load.TruckCode,
      FreightTerms: "",
      BranchCode: load.BranchCode,
      IncludeContractsWithoutBalance: false,
    });

    contractsTable.clearSelection();
    await this.loadAvailableReleases(load.ItemCode ?? "");

    this._billingDialog?.open();
  }

  /**
   * Recarrega a lista de liberações com ou sem o filtro de saldo do contrato. Só muda o que a
   * lista MOSTRA: não há guard de saldo no faturamento, então isto nunca é a causa de uma recusa.
   */
  async onToggleContractsWithoutBalance(): Promise<void> {
    const viewModel = this.getModel("viewModel") as JSONModel;
    (this.byId("shipmentBillingSalesContractsTable") as Table).clearSelection();

    await this.loadAvailableReleases(viewModel.getProperty("/ItemCode") as string);
  }

  private async loadAvailableReleases(itemCode: string): Promise<void> {
    const model = this.getModel() as ODataModel;
    const func = model.bindContext("/SalesShipmentReleasesGetAvailable(...)");
    func.setParameter("ItemCode", itemCode);
    func.setParameter(
      "IncludeContractsWithoutBalance",
      Boolean((this.getModel("viewModel") as JSONModel).getProperty("/IncludeContractsWithoutBalance")));

    this.setBusy(true);
    try {
      await func.invoke();
      const releasesModel = this.getModel("releases") as JSONModel;
      releasesModel.setData(func.getBoundContext().getObject() as object);
    } finally {
      this.setBusy(false);
    }
  }

  // hasTruckCodeInconsistency e hasItemCodeInconsistency migraram para a Montagem de Carga,
  // onde a aglutinação passa a ser decidida (e ganharam a terceira, de filial). Aqui a carga
  // já chega homogênea por construção — simplificação real, não remoção de validação.

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

      const viewModelForm = this.getModel("viewModel") as JSONModel;
      const volume = Number(viewModelForm.getProperty("/Volume"));
      const available = Number(viewModelForm.getProperty("/AvailableQuantity"));

      // Validação local do saldo FÍSICO da carga. O backend recusa igual — isto só evita a
      // ida ao servidor e dá a mensagem no idioma da tela.
      if (!(volume > 0)) {
        MessageBox.warning("Informe uma quantidade a faturar maior que zero.");
        return;
      }

      if (volume > available) {
        MessageBox.warning(
          `Quantidade a faturar maior que o saldo da carga (${available.toLocaleString("pt-BR", { minimumFractionDigits: 3 })}).`);
        return;
      }


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
            // A nota aponta a CARGA e não escreve romaneio: com N notas por carga,
            // SalesInvoiceKey no romaneio não teria dono único.
            ShipmentLoadKey: billing?.ShipmentLoadKey,
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
