import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ManagedObject from "sap/ui/base/ManagedObject";
import Fragment from "sap/ui/core/Fragment";
import Controller from "sap/ui/core/mvc/Controller";
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import Sorter from "sap/ui/model/Sorter";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/** Carga a faturar — os campos que o diálogo usa. */
export type BillingLoad = {
  Key: string,
  Code: string,
  ItemCode: string,
  ItemName: string,
  BranchCode: string,
  AvailableQuantity: number,
  TruckDriverCode: string,
  TruckDriverName: string,
  TruckCode: string,
  CarrierCardCode: string,
  CarrierName: string,
}

/** O que o helper precisa da tela dona (membros protegidos do controller chegam como funções). */
export type BillingDialogHost = {
  /** Dono do fragmento (handlers .saveBillingDialog/.closeBillingDialog/value helps). */
  controller: Controller,
  view: View,
  setBusy(busy: boolean): void,
  validateForm(formId: string): boolean,
  registerTableLayouts(root: ManagedObject): void,
  isTaxCalculationActive(branchCode: string): Promise<boolean>,
  /** Depois de faturar (também no erro): a tela atualiza o que precisa. */
  onBilled(): void,
  /** Ao fechar (o /shipment-billing limpa a seleção da lista). */
  onClosed?(): void,
}

/** Dados do formulário do diálogo de faturamento (model "billing"). */
type BillingForm = {
  InvoiceDate?: string,
  BranchCode?: string,
  Volume?: string | number,
  TruckingCompanyCode?: string,
  /** Só exibição — copiado da carga junto com o código, não vai no payload. */
  TruckingCompanyName?: string,
  TruckCode?: string,
  TruckDriverCode?: string,
  /** Só exibição — nome desnormalizado da carga, não vai no payload. */
  TruckDriverName?: string,
  TaxPayerComments?: string,
  DeliveryCardCode?: string,
  /** Só exibição — preenchido pelo value help, não vai no payload. */
  DeliveryCardName?: string,
  ItemCode?: string,
  FreightTerms?: string,
  FreightCost?: number,
  /** "Nfe" ou "Other" — só aparece (e só vale) na filial que emite NF-e pelo Siagro. */
  TaxDocumentKind?: string,
  /** Só exibição — a filial da carga emite NF-e pelo Siagro (TaxCalculationGate). */
  TaxLocked?: boolean,
  /** Chave da carga faturada — substitui `SalesTransactions` no payload. */
  ShipmentLoadKey?: string,
  ShipmentLoadCode?: string,
  /** Saldo da carga no momento da abertura, limite da quantidade a faturar. */
  AvailableQuantity?: number,
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
 * Diálogo de faturamento de uma carga, compartilhado entre o Faturamento da Expedição e o
 * detalhe da carga. Os modelos do fragmento têm nomes próprios (billing, billingReleases,
 * billingBranches) para não colidir com o "viewModel" das telas que o hospedam.
 */
export default class ShipmentBillingDialog {

  private _billingDialog: Dialog;
  private _busyDialog: Dialog;
  /** Trava de reentrância do faturamento — ver `save`. */
  private _billingInFlight = false;

  constructor(private readonly host: BillingDialogHost) {
    // Liberações de venda disponíveis do dialog de faturamento: resultado da function
    // OData vai para um JSONModel (a resposta é array cru, sem envelope — mesmo padrão
    // de SelectShipmentRelease; bindar a table direto na function quebra o modelo V4).
    host.view.setModel(new JSONModel([]), "billingReleases");

    // Filiais do Select do diálogo num JSONModel estático, e não bindadas direto em /Branchs:
    // o selectedKey vem do "billing" (JSONModel setado antes de abrir), e com o binding OData
    // os itens só chegavam DEPOIS do primeiro render — o sap.m.Select reconciliava a seleção
    // internamente (getSelectedItem() correto) sem repintar, e o campo ficava visualmente vazio.
    // Mesmo padrão de shipmentLoads/FormController.loadBranches.
    host.view.setModel(new JSONModel([]), "billingBranches");

    host.view.setModel(new JSONModel({}), "billing");
  }

  async open(load: BillingLoad): Promise<void> {
    await this.loadBranches();
    await this.ensureDialog();

    // UMA carga: a aglutinação já foi decidida na Montagem, e por isso as duas checagens de
    // consistência (placa e produto) saíram daqui — a carga é homogênea por construção.
    if (!(load.AvailableQuantity > 0)) {
      MessageBox.warning("Carga sem saldo a faturar.");
      return;
    }

    const contractsTable = this.host.view.byId("shipmentBillingSalesContractsTable") as Table;
    const billingModel = this.host.view.getModel("billing") as JSONModel;

    billingModel.setData({
      ItemCode: load.ItemCode,
      ItemName: load.ItemName,
      // Sugere o saldo inteiro; o usuário reduz para faturar em partes.
      Volume: load.AvailableQuantity,
      AvailableQuantity: load.AvailableQuantity,
      ShipmentLoadKey: load.Key,
      ShipmentLoadCode: load.Code,
      TruckDriverCode: load.TruckDriverCode,
      TruckDriverName: load.TruckDriverName,
      TruckCode: load.TruckCode,
      // Transportadora vem da carga e o campo é somente leitura no diálogo: faturar com
      // transportadora diferente da da carga é recusado pelo backend.
      TruckingCompanyCode: load.CarrierCardCode,
      TruckingCompanyName: load.CarrierName,
      FreightTerms: "",
      BranchCode: load.BranchCode,
      TaxDocumentKind: "Nfe",
      TaxLocked: false,
    });

    billingModel.setProperty("/TaxLocked", await this.host.isTaxCalculationActive(load.BranchCode));

    contractsTable.clearSelection();
    await this.loadAvailableReleases(load.ItemCode ?? "");

    this._billingDialog?.open();
  }

  async save(): Promise<void> {
    // Trava de reentrância: precisa ser avaliada e setada ANTES do primeiro await, senão
    // um duplo clique em "Confirmar" enfileira dois MessageBox.confirm e dispara dois
    // faturamentos do mesmo carregamento (documento de saída duplicado, saldo do contrato
    // descontado duas vezes). O backend também recusa, mas aqui o usuário nem chega lá.
    if (this._billingInFlight) {
      return;
    }
    this._billingInFlight = true;

    try {
      if (!this.host.validateForm("shipmentBillingSalesContractsForm")) {
        MessageBox.warning("Por favor, preencha corretamente todos os campos obrigatórios.");
        return;
      }

      const billingModel = this.host.view.getModel("billing") as JSONModel;
      const volume = Number(billingModel.getProperty("/Volume"));
      const available = Number(billingModel.getProperty("/AvailableQuantity"));

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


      const contractsTable = this.host.view.byId("shipmentBillingSalesContractsTable") as Table;
      const selectedContract = contractsTable.getSelectedIndices();
      if (selectedContract.length < 1) {
        MessageBox.error("Liberação de entrega não selecionada.");
        throw new Error("Liberação de entrega não selecionada.");
      }

      // Contexto do JSONModel "billingReleases" (não OData) — getObject() devolve o DTO da function.
      const contractCtx = contractsTable.getContextByIndex(selectedContract[0]);

      if (contractCtx) {
        const model = this.host.view.getModel() as ODataModel;
        const release = contractCtx.getObject() as BilledRelease;
        const billing = billingModel.getData() as BillingForm;

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
                SalesShipmentReleaseKey: release?.SalesShipmentReleaseKey,
                // Frete, seguro, desconto e outras despesas da linha (spec 2026-10-05 §10): o faturamento não os informa.
                FreightValue: 0,
                InsuranceValue: 0,
                DiscountValue: 0,
                OtherExpensesValue: 0
              }
            ],
            // A nota aponta a CARGA e não escreve romaneio: com N notas por carga,
            // SalesInvoiceKey no romaneio não teria dono único.
            ShipmentLoadKey: billing?.ShipmentLoadKey,
            TaxDocumentKind: billing?.TaxDocumentKind ?? "Nfe",
            FreightTerms: billing?.FreightTerms,
            FreightCostStandard: billing?.FreightCost
          };

          this.close();

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
            this.host.onBilled();
          }
        }
      }
    } finally {
      this._billingInFlight = false;
    }
  }

  close(): void {
    const contractsTable = this.host.view.byId("shipmentBillingSalesContractsTable") as Table;
    contractsTable.clearSelection();

    this._billingDialog.close();
    this.host.onClosed?.();
  }

  private async ensureDialog(): Promise<void> {
    const view = this.host.view;
    this._billingDialog = view.byId("billingDialog") as Dialog;

    if (!this._billingDialog) {
      this.host.setBusy(true);
      this._billingDialog = await Fragment.load({
        id: view.getId(),
        name: "siagrob1.view.shipmentBilling.fragments.Billing",
        controller: this.host.controller
      }) as unknown as Dialog;
      view.addDependent(this._billingDialog);

      // O diálogo renderiza por conta própria e não passa pelo `onBeforeRendering` da view.
      this.host.registerTableLayouts(this._billingDialog);
    }
    this.host.setBusy(false);
  }

  /**
   * Carrega as filiais uma única vez, ANTES de o diálogo renderizar — é isso que garante que o
   * Select já nasça com os itens e o selectedKey casados.
   */
  private async loadBranches(): Promise<void> {
    const branchesModel = this.host.view.getModel("billingBranches") as JSONModel;
    if ((branchesModel.getData() as unknown[]).length > 0) return;

    const contexts = await (this.host.view.getModel() as ODataModel)
      .bindList("/Branchs", undefined, [new Sorter("Code")])
      .requestContexts(0, 100);

    branchesModel.setData(
      contexts.map(ctx => ctx.getObject() as { Code: string, ShortName: string }));
  }

  private async loadAvailableReleases(itemCode: string): Promise<void> {
    const model = this.host.view.getModel() as ODataModel;
    const func = model.bindContext("/SalesShipmentReleasesGetAvailable(...)");
    func.setParameter("ItemCode", itemCode);

    this.host.setBusy(true);
    try {
      await func.invoke();
      const releasesModel = this.host.view.getModel("billingReleases") as JSONModel;
      releasesModel.setData(func.getBoundContext().getObject() as object);
    } finally {
      this.host.setBusy(false);
    }
  }

  private async createBusyDialog(): Promise<void> {
    if (!this._busyDialog) {
      this._busyDialog = await Fragment.load({
        name: "siagrob1.view.shipmentBilling.fragments.BusyDialog",
        controller: this.host.controller,
      }) as unknown as Dialog;
      this.host.view.addDependent(this._busyDialog);
    }
  }
}
