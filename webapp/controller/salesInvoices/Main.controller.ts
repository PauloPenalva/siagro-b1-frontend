
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import JSONModel from "sap/ui/model/json/JSONModel";
import { BaseController } from "./BaseController";
import MessageToast from "sap/m/MessageToast";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import Dialog from "sap/m/Dialog";
import { Input$LiveChangeEvent } from "sap/m/Input";
import Fragment from "sap/ui/core/Fragment";

const NFE_KEY_LENGTH = 44;

/** Um romaneio do documento que ainda pode ser devolvido — linha da grade do retorno. */
interface ReturnableShipment {
  StorageTransactionKey: string;
  Code?: string;
  TransactionDate?: string;
  TruckCode?: string;
  ItemCode?: string;
  ItemName?: string;
  UnitOfMeasureCode?: string;
  WarehouseCode?: string;
  WarehouseName?: string;
  NetWeight: number;
  /**
   * Quanto deste romaneio volta. Nasce igual ao `NetWeight` — a carreta inteira — e só é
   * editável quando a mercadoria retorna a um armazém.
   */
  ReturnQuantity: number;
}

/** Estado do formulário do diálogo de retorno. */
interface ReturnForm {
  /** 0 = caminhão segue viagem, 1 = mercadoria volta a um armazém. */
  DestinationIndex: number;
  DestinationWarehouseCode?: string;
  DestinationWarehouseName?: string;
  Reason?: string;
  /** Soma das quantidades das linhas selecionadas, exibida na barra da grade. */
  SelectedTotal: number;
  busy: boolean;
}

/**
 * @namespace siagrob1.controller.salesInvoices
 */
export default class Main extends BaseController {

  formatter = formatter;

  private _notaFiscalDialog: Dialog;

  private _returnDialog: Dialog;

  private _returnInvoiceKey: string;

  private _returnInFlight = false;

	onInit(): void  {
    this.createFilterModel();

    this.getRouter().getRoute("salesInvoices")
      .attachPatternMatched(() => this.applyFilters());
	}

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

	onSearch(): void {
    this.applyFilters()
	}

  private applyFilters() {
    const oBinding = this.getView().byId("tableSalesInvoices").getBinding("rows") as ODataListBinding;
    const filterModel = this.getModel("filter") as JSONModel;
    const filterData = filterModel.getData() as Record<string, string>;
    const filters: string[] = [];

    Object.keys(filterData).forEach((key: string) => {
      const filterKey = key;
      const value = filterData[filterKey];

      if (!value) return;

      if (filterKey == "InvoiceStatus" ) {
        filters.push(`${filterKey} eq '${value}'`)
      } else if (filterKey == "DateFrom") {
        filters.push(`InvoiceDate ge ${value}`)
      } else if (filterKey == "DateTo") {
        filters.push(`InvoiceDate le ${value}`)
      } else if (filterKey == "WithoutTaxDocument") {
        // Checkbox: só entra quando marcado (desmarcado é `false`, já descartado acima).
        // O `eq ''` cobre documentos antigos, gravados antes de o serviço normalizar
        // branco para null.
        filters.push(`(TaxDocumentNumber eq null or TaxDocumentNumber eq '')`)
      } else {
        filters.push(`contains(${filterKey},'${value}')`)
      }
    });

    const filterParam = filters.length > 0 ? filters.join(' and ') : undefined;

		oBinding.changeParameters({
      $filter: filterParam
    });
  }

  /**
   * Documento de saída AVULSO — sem romaneio. O faturamento de romaneio continua entrando
   * pela tela de Expedição.
   */
  onCreate(): void {
    this.navTo("salesInvoicesAdd");
  }

 	onDetail(): void {
		const oTable = this.byId("tableSalesInvoices") as Table;
    const i = oTable.getSelectedIndex()

    if (i < 0) {
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const oContext = oTable.getContextByIndex(i)
		const sId = oContext.getProperty("Key") as string;
    
		this.navTo("salesInvoicesDetail", {id: sId});
	}

  private refreshData() {
    const oTable = this.byId("tableSalesInvoices") as Table;
    (oTable.getBinding("rows") as ODataListBinding).refresh();
  }
 
  async onCancel() {
    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();
    if (selectedInvoice.length == 0){
      MessageBox.warning("Selecione um registro.")
      throw new Error("Selecione um registro");
    }

    if (selectedInvoice.length > 1){
      MessageBox.warning("Selecione apenas um registro.")
      throw new Error("Selecione apenas um registro.");
    }

    if (await DialogHelper.confirmDialog("Cancelar Documento de Saída ?")) {
      const ctx = table.getContextByIndex(selectedInvoice[0]);
      const oModel = this.getModel() as ODataModel;
      const action = oModel.bindContext("/SalesInvoicesCancel(...)");
      action.setParameter("Key", ctx.getProperty("Key"));
      
      this.setBusy(true);
      void action.invoke()
        .then(() => {
          this.refreshData();
          MessageToast.show("Documento de saída cancelado com sucesso.")
        })
        .finally(() => this.setBusy(false));
    }
  }

  async onNotaFiscal() {
    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();
    if (selectedInvoice.length == 0){
      MessageBox.warning("Selecione um registro.")
      throw new Error("Selecione um registro");
    }

    this._notaFiscalDialog ??= await DialogHelper.createDialog(
      this, 
      "siagrob1.view.salesInvoices.fragments.NotaFiscalDialog"
    );

    const ctx = table.getContextByIndex(selectedInvoice[0]);
    const viewModel = this.getModel("viewModel") as JSONModel;
    viewModel.setData({
      TaxDocumentNumber: ctx.getProperty("TaxDocumentNumber") as string,
      TaxDocumentSeries: ctx.getProperty("TaxDocumentSeries") as string,
      ChaveNFe: ctx.getProperty("ChaveNFe") as string,

    });

    void this.openNotaFiscalDialog();
  }

  private openNotaFiscalDialog(){
    this._notaFiscalDialog?.open();
  }

  onCloseNotaFiscalDialog() {
    this._notaFiscalDialog?.close();
  }

  /**
   * A chave de acesso da NF-e tem layout fixo de 44 dígitos, com série e número em posições
   * conhecidas — digitar só a chave já basta para preencher o resto do formulário.
   */
  onChaveNFeLiveChange(ev: Input$LiveChangeEvent) {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const chave = (ev.getParameter("value") || "").replace(/\D/g, "");

    // Número e série são somente leitura: a chave é a única origem deles, então enquanto ela
    // estiver incompleta os dois ficam em branco em vez de manter um valor órfão.
    if (chave.length !== NFE_KEY_LENGTH) {
      viewModel.setProperty("/TaxDocumentSeries", "");
      viewModel.setProperty("/TaxDocumentNumber", "");
      return;
    }

    // Série e número são gravados como estão na chave, zero-preenchidos (série 001, número
    // 000000167) — é assim que o usuário informa manualmente.
    viewModel.setProperty("/TaxDocumentSeries", chave.substring(22, 25));
    viewModel.setProperty("/TaxDocumentNumber", chave.substring(25, 34));
  }

  onNotaFiscalConfirm() {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const notaFiscal = ((viewModel.getProperty("/TaxDocumentNumber") as string) || "").trim();
    const serie = ((viewModel.getProperty("/TaxDocumentSeries") as string) || "").trim();
    const chaveNfe = ((viewModel.getProperty("/ChaveNFe") as string) || "").trim();

    if (!notaFiscal || !serie) {
      MessageBox.warning("Preencha corretamente o formulário.");
      return;
    }

    this.sendDocumentNumber(notaFiscal, serie, chaveNfe, "Documento de saída atualizado com sucesso.");
  }

  /**
   * Limpar é a mesma action com os três campos em branco: o backend já normaliza vazio para
   * null, então não há uma segunda regra de negócio a manter aqui.
   */
  async onNotaFiscalClear() {
    if (!await DialogHelper.confirmDialog("Limpar nota fiscal, série e chave de acesso deste documento ?"))
      return;

    this.sendDocumentNumber("", "", "", "Dados da nota fiscal removidos com sucesso.");
  }

  private sendDocumentNumber(
    documentNumber: string, documentSeries: string, chaveNFe: string, successMessage: string
  ) {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();

    const ctx = table.getContextByIndex(selectedInvoice[0]) as Context;

    const oModel = ctx.getModel() as ODataModel;
    const action = oModel.bindContext("/SalesInvoicesSetDocumentNumber(...)")
    action.setParameter("Key", ctx.getProperty("Key"));
    action.setParameter("DocumentNumber", documentNumber);
    action.setParameter("DocumentSeries", documentSeries);
    action.setParameter("ChaveNFe", chaveNFe);

    this.setBusy(true);
    void action.invoke()
      .then(() => {
        this.onCloseNotaFiscalDialog();
        viewModel.setData({});
        MessageToast.show(successMessage);
        this.refreshData();
      })
      .finally(() => this.setBusy(false));
  }

  /**
   * Abre o diálogo de retorno, carregando os romaneios do documento que ainda podem ser
   * devolvidos.
   *
   * A escolha é por ROMANEIO; a quantidade é opcional dentro dele. Todos nascem selecionados e
   * com a carreta inteira, porque o retorno total é o caso comum: quem devolve em parte desmarca
   * o que não voltou e, se a mercadoria for a um armazém, ajusta a quantidade da linha.
   */
  async onReturn() {
    const table = this.byId("tableSalesInvoices") as Table;
    const selectedInvoice = table.getSelectedIndices();
    if (selectedInvoice.length == 0){
      MessageBox.warning("Selecione um registro.")
      return;
    }

    const ctx = table.getContextByIndex(selectedInvoice[0]) as Context;
    this._returnInvoiceKey = ctx.getProperty("Key") as string;

    const model = this.getModel() as ODataModel;
    const func = model.bindContext("/SalesInvoicesGetReturnableShipments(...)");
    func.setParameter("Key", this._returnInvoiceKey);

    this.setBusy(true);
    try {
      await func.invoke();

      // getObject() de uma function que devolve COLEÇÃO entrega o envelope OData
      // ({ "@odata.context": ..., value: [...] }), e não o array. Passa em ts-typecheck e lint,
      // e só quebra no navegador.
      const result = func.getBoundContext().getObject() as { value?: ReturnableShipment[] };

      const shipments = result?.value ?? [];

      if (shipments.length === 0) {
        MessageBox.warning(
          "Este documento não tem romaneio faturado a devolver.");
        return;
      }

      // A quantidade a devolver nasce igual ao peso líquido: o retorno total é o caso comum, e
      // é o valor que o backend assume quando nenhuma quantidade é informada.
      shipments.forEach(s => { s.ReturnQuantity = s.NetWeight; });

      this.getView().setModel(new JSONModel(shipments), "returnShipments");
      this.getView().setModel(new JSONModel({
        DestinationIndex: 0,
        DestinationWarehouseCode: "",
        DestinationWarehouseName: "",
        Reason: "",
        SelectedTotal: shipments.reduce((total, s) => total + s.NetWeight, 0),
        busy: false,
      } as ReturnForm), "return");

      // Carregado com o ID DA VIEW, e não por DialogHelper.createDialog: aquele prefixa os
      // controles com o nome do fragmento, e `this.byId("returnShipmentsTable")` não os
      // encontraria — a seleção dos romaneios depende de achar a tabela pelo id.
      if (!this._returnDialog) {
        this._returnDialog = await Fragment.load({
          id: this.getView().getId(),
          name: "siagrob1.view.salesInvoices.fragments.Return",
          controller: this,
        }) as Dialog;

        this.getView().addDependent(this._returnDialog);
      }

      const shipmentsTable = this.byId("returnShipmentsTable") as Table;
      shipmentsTable.clearSelection();
      shipments.forEach((_, index) => shipmentsTable.addSelectionInterval(index, index));

      this._returnDialog.open();
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Value help do armazém de destino, com escrita PRÓPRIA no model `return`.
   *
   * Não usa o `openWarehouseValueHelp` comum de propósito: aquele resolve o destino da descrição
   * por `oInput.getBindingContext()` SEM nome de model, e aqui o alvo é um JSONModel nomeado
   * dentro de um diálogo. Escrever à mão é o que garante que código e nome cheguem no lugar certo.
   */
  async openReturnWarehouseValueHelp(): Promise<void> {
    const selected = await DialogHelper.openTableSelectDialog(
      this, "WarehousesSelectDialog", ["Code", "Name", "TaxId", "FName"], []);

    if (!selected) return;

    const form = this.getModel("return") as JSONModel;

    form.setProperty("/DestinationWarehouseCode", selected.getProperty("Code") as string);
    form.setProperty("/DestinationWarehouseName", selected.getProperty("Name") as string);
  }

  /**
   * Trocar para "segue para novo destino" limpa o armazém: deixá-lo preenchido e invisível
   * mandaria um código de armazém junto de um retorno que não devolve nada a armazém nenhum.
   *
   * E devolve as quantidades ao peso líquido: naquele destino o romaneio volta INTEIRO ao pool
   * de faturamento, então uma quantidade parcial digitada antes da troca seria recusada pelo
   * backend — e o campo já não está visível para o operador entender por quê.
   */
  onReturnDestinationChange(): void {
    const form = this.getModel("return") as JSONModel;

    if (form.getProperty("/DestinationIndex") !== 1) {
      form.setProperty("/DestinationWarehouseCode", "");
      form.setProperty("/DestinationWarehouseName", "");

      const shipmentsModel = this.getModel("returnShipments") as JSONModel;
      const shipments = shipmentsModel.getData() as ReturnableShipment[];

      shipments.forEach((s, index) =>
        shipmentsModel.setProperty(`/${index}/ReturnQuantity`, s.NetWeight));
    }

    this.updateReturnTotal();
  }

  /**
   * Recalcula o total devolvido a partir das linhas SELECIONADAS. A grade é lida pela tabela, e
   * não pelo model, porque a seleção é estado do controle: quantidade digitada em linha
   * desmarcada não vai no retorno e não pode entrar na conta.
   */
  updateReturnTotal(): void {
    const table = this.byId("returnShipmentsTable") as Table;

    if (!table) return;

    const shipments = (this.getModel("returnShipments") as JSONModel)
      .getData() as ReturnableShipment[];

    const total = table.getSelectedIndices()
      .map(i => shipments[i])
      .filter(Boolean)
      .reduce((sum, s) => sum + (Number(s.ReturnQuantity) || 0), 0);

    (this.getModel("return") as JSONModel).setProperty("/SelectedTotal", total);
  }

  onCloseReturn(): void {
    this._returnDialog?.close();
  }

  async onConfirmReturn(): Promise<void> {
    // Trava de reentrância avaliada e setada ANTES do primeiro await: um duplo clique enfileira
    // dois retornos do mesmo documento, e o segundo estouraria no meio do caminho.
    if (this._returnInFlight) return;
    this._returnInFlight = true;

    const formModel = this.getModel("return") as JSONModel;
    const shipmentsModel = this.getModel("returnShipments") as JSONModel;

    try {
      const form = formModel.getData() as ReturnForm;
      const shipments = shipmentsModel.getData() as ReturnableShipment[];

      const table = this.byId("returnShipmentsTable") as Table;
      const chosen = table.getSelectedIndices().map(i => shipments[i]).filter(Boolean);

      if (chosen.length === 0) {
        MessageBox.warning("Selecione ao menos um romaneio a devolver.");
        return;
      }

      if (!form.Reason?.trim()) {
        MessageBox.warning("Informe o motivo do retorno.");
        return;
      }

      const toWarehouse = form.DestinationIndex === 1;

      if (toWarehouse && !form.DestinationWarehouseCode?.trim()) {
        MessageBox.warning("Informe o armazém de destino da mercadoria devolvida.");
        return;
      }

      // A quantidade só existe no destino armazém; em "segue viagem" o romaneio volta inteiro.
      // Number() explícito porque o Input escreve string no JSONModel quando o usuário digita.
      const invalid = toWarehouse
        ? chosen.find(s => {
          const quantity = Number(s.ReturnQuantity);
          return !(quantity > 0) || quantity > s.NetWeight;
        })
        : undefined;

      if (invalid) {
        MessageBox.warning(
          `Informe uma quantidade a devolver entre 0 e ${invalid.NetWeight} ` +
          `para o romaneio ${invalid.Code}.`);
        return;
      }

      const total = chosen.reduce(
        (sum, s) => sum + (toWarehouse ? Number(s.ReturnQuantity) : s.NetWeight), 0);

      const confirmed = await DialogHelper.confirmDialog(
        toWarehouse
          ? `Confirma o retorno de ${formatter.formatDecimal(total, 3)}, devolvendo a ` +
            "mercadoria ao armazém informado ?"
          : "Confirma o retorno ? Os romaneios voltarão a ficar disponíveis para faturamento.");

      if (!confirmed) return;

      const action = (this.getModel() as ODataModel).bindContext("/SalesInvoicesReturn(...)");
      action.setParameter("Key", this._returnInvoiceKey);
      action.setParameter(
        "StorageTransactionKeys", chosen.map(s => s.StorageTransactionKey));
      // Array PARALELO ao de chaves. Vazio em "segue viagem": lá o romaneio volta inteiro, e é
      // a lista vazia que faz o backend assumir o peso líquido de cada um.
      action.setParameter(
        "Quantities", toWarehouse ? chosen.map(s => Number(s.ReturnQuantity)) : []);
      action.setParameter("Destination", toWarehouse ? "Warehouse" : "Rebilling");
      action.setParameter("Reason", form.Reason.trim());
      // SEMPRE definido, nunca undefined: JSON.stringify omite chave undefined e o OData
      // rejeita o corpo inteiro por parâmetro faltando, sem dizer qual.
      action.setParameter(
        "DestinationWarehouseCode", toWarehouse ? form.DestinationWarehouseCode.trim() : "");

      formModel.setProperty("/busy", true);
      try {
        await action.invoke();
      } finally {
        formModel.setProperty("/busy", false);
      }

      this._returnDialog.close();
      this.refreshData();

      MessageToast.show(
        toWarehouse
          ? "Retorno registrado. Mercadoria devolvida ao armazém."
          : "Retorno registrado. Romaneios disponíveis para novo faturamento.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this._returnInFlight = false;
    }
  }
}
