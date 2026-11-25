import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ManagedObject from "sap/ui/base/ManagedObject";
import Fragment from "sap/ui/core/Fragment";
import Controller from "sap/ui/core/mvc/Controller";
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ListBinding from "sap/ui/model/ListBinding";
import Table from "sap/ui/table/Table";
import { BilledRelease, requestAvailableSalesReleases } from "siagrob1/helpers/ShipmentBillingDialog";
import {
  canLink, defaultLinkPeriod, formatKg, formatMoney, isStaleRequest, LinkableSapInvoice, LinkedDocument, normalizeLinkableInvoices,
  normalizeLinkedDocuments, normalizeLinkPreview, preselectedReleaseIndex, releasesForLoad, SapLinkPreview, withReleaseDisplay,
} from "siagrob1/helpers/SapInvoiceLinkHelpers";

/** Carga a vincular — os campos que o diálogo usa. */
export type SapLinkLoad = { Key: string, Code: string, ItemCode: string, AvailableQuantity: number, CardCode: string }

export type { LinkedDocument };

export type SapInvoiceLinkHost = {
  view: View,
  /**
   * Depois de vincular com sucesso, com os documentos criados (um por NF): com um só, a tela leva o usuário a ele;
   * com vários, fica na carga e a atualiza.
   */
  onLinked(created: LinkedDocument[]): void,
  /** Registra as `sap.ui.table.Table` do diálogo no layout de colunas por usuário. */
  registerTableLayouts(root: ManagedObject): void,
}

/** Estado do model "sapLink". */
type SapLinkState = {
  DateFrom: string,
  DateTo: string,
  Invoices: LinkableSapInvoice[],
  Releases: BilledRelease[],
  /** Mostra também as liberações de outros clientes (desligado a cada abertura). */
  ShowOthers: boolean,
  /** Há prévia válida para a seleção atual: mostra o rodapé de valores. */
  PreviewVisible: boolean,
  /** Prévia em andamento. */
  PreviewLoading: boolean,
  /** Mensagem do servidor quando a prévia falha (vazio: sem erro). */
  PreviewError: string,
  /** Faixa de aviso do vínculo com divergência (vazio: sem divergência). */
  DivergenceText: string,
  QuantityEffective: string,
  QuantityInvoice: string,
  QuantityDifference: string,
  ValueEffective: string,
  ValueInvoice: string,
  ValueDifference: string,
  /** Há NF, liberação e a prévia da seleção atual deu certo: habilita "Vincular". */
  CanLink: boolean,
}

/**
 * Diálogo "Vincular NF do SAP" da carga (GAC-1226): escolhe uma ou mais NFs do SAP ainda não vinculadas e uma liberação de entrega; o backend calcula a prévia
 * (efetivo x NF) e aceita divergência de quantidade e/ou valor após a confirmação do usuário; cria um documento
 * de saída por NF. O model do fragmento chama-se
 * "sapLink" para não colidir com o "viewModel" do detalhe nem com os "billing…" do diálogo de faturar.
 */
export default class SapInvoiceLinkDialog {

  private _dialog: Dialog;
  private _load: SapLinkLoad;
  /** Trava de reentrância do vínculo — setada ANTES do primeiro await (duplo clique não manda duas requisições). */
  private _linkInFlight = false;
  /** Descarta resposta atrasada de uma busca quando outra já foi disparada (ou o diálogo reabriu). */
  private _searchId = 0;
  /**
   * Token da carga das liberações: só `open`/`close` o mudam. Separado de `_searchId` porque "Buscar" durante a
   * carga das liberações descartaria a resposta delas e a lista ficaria vazia até reabrir o diálogo.
   */
  private _openId = 0;
  /** Todas as liberações disponíveis do item; o model mostra as do cliente da carga (ou todas, com o switch). */
  private _allReleases: BilledRelease[] = [];
  /** NFs marcadas, lidas dos índices selecionados pelos contextos do binding (o que o usuário vê marcado). */
  private _selectedInvoices: LinkableSapInvoice[] = [];
  /** Token da prévia: resposta de uma seleção antiga nunca sobrescreve a atual. */
  private _previewId = 0;
  /** Prévia da seleção atual (indefinida enquanto carrega, sem seleção ou com erro). */
  private _preview: SapLinkPreview;

  /** Controller do fragmento: handlers como funções do próprio helper. */
  private readonly _fragmentController = {
    onSearch: (): void => void this.search(),
    onInvoiceSelect: (): void => this.onInvoiceSelect(),
    onReleaseSelect: (): void => void this.refreshPreview(),
    onShowOthersChange: (): void => this.rebuildReleases(),
    onInvoicesFilterOrSort: (): void => this.clearInvoiceSelection(),
    onReleasesFilterOrSort: (): void => { this.releasesTable()?.clearSelection(); },
    onLink: (): Promise<void> => this.link(),
    onCancel: (): void => this.close(),
  };

  constructor(private readonly host: SapInvoiceLinkHost) {
    host.view.setModel(new JSONModel(this.emptyState()), "sapLink");
  }

  async open(load: SapLinkLoad): Promise<void> {
    this._load = load;
    this._searchId++;
    this._openId++;
    this._allReleases = [];
    this._selectedInvoices = [];
    this._preview = undefined;
    this._previewId++;
    this.model().setData(this.emptyState());

    await this.ensureDialog();
    this.invoicesTable().clearSelection();
    this.releasesTable().clearSelection();
    this._dialog.open();

    await Promise.all([this.search(), this.loadReleases()]);
  }

  close(): void {
    this._searchId++;
    this._openId++;
    this._previewId++;
    this._dialog?.close();
  }

  private emptyState(): SapLinkState {
    return {
      ...defaultLinkPeriod(), Invoices: [], Releases: [], ShowOthers: false, PreviewVisible: false, PreviewLoading: false,
      PreviewError: "", DivergenceText: "", QuantityEffective: "—", QuantityInvoice: "—", QuantityDifference: "—",
      ValueEffective: "—", ValueInvoice: "—", ValueDifference: "—", CanLink: false,
    };
  }

  private model(): JSONModel {
    return this.host.view.getModel("sapLink") as JSONModel;
  }

  private byId(id: string) {
    return this.host.view.byId(id);
  }

  private invoicesTable(): Table {
    return this.byId("sapLinkInvoicesTable") as Table;
  }

  private releasesTable(): Table {
    return this.byId("sapLinkReleasesTable") as Table;
  }

  private async ensureDialog(): Promise<void> {
    if (this._dialog) {
      return;
    }
    this._dialog = await Fragment.load({
      id: this.host.view.getId(),
      name: "siagrob1.view.shipmentLoads.fragments.SapInvoiceLinkDialog",
      controller: this._fragmentController as unknown as Controller,
    }) as unknown as Dialog;
    this.host.view.addDependent(this._dialog);
    // Ordem e largura das colunas por usuário (ids estáveis no fragmento).
    this.host.registerTableLayouts(this._dialog);
  }

  /** NF do SAP do período escolhido (a function traz as de quantidade maior que zero, inclusive as maiores que o saldo da carga, para o usuário notar o erro). */
  private async search(): Promise<void> {
    const model = this.model();
    const requestId = ++this._searchId;

    // Resultado anterior some junto com a escolha dele: a seleção da tabela é por posição.
    model.setProperty("/Invoices", []);
    this.clearInvoiceSelection();

    const func = (this.host.view.getModel() as ODataModel).bindContext("/ShipmentLoadsGetLinkableSapInvoices(...)");
    func.setParameter("Key", this._load.Key);
    // Parâmetros string no formato yyyy-MM-dd (o backend não aceita Edm.Date aqui).
    func.setParameter("DateFrom", model.getProperty("/DateFrom") as string);
    func.setParameter("DateTo", model.getProperty("/DateTo") as string);

    this._dialog.setBusy(true);
    try {
      await func.invoke();
      if (requestId !== this._searchId) {
        return;
      }
      model.setProperty("/Invoices", normalizeLinkableInvoices(func.getBoundContext().getObject()));
    } catch (e) {
      if (requestId === this._searchId) {
        // O 400 de negócio traz a mensagem em pt-BR do servidor; ela é mostrada como veio.
        MessageBox.error((e as Error).message);
      }
    } finally {
      if (requestId === this._searchId) {
        this._dialog.setBusy(false);
      }
    }
  }

  private async loadReleases(): Promise<void> {
    const openId = this._openId;
    try {
      const releases = await requestAvailableSalesReleases(this.host.view.getModel() as ODataModel, this._load.ItemCode ?? "");
      if (isStaleRequest(openId, this._openId)) {
        return;
      }
      this._allReleases = releases.map(withReleaseDisplay);
      this.rebuildReleases();
    } catch (e) {
      if (!isStaleRequest(openId, this._openId)) {
        MessageBox.error((e as Error).message);
      }
    }
  }

  /**
   * Regra seleção x filtro/ordenação: a seleção da `sap.ui.table.Table` é por ÍNDICE do binding, e filtrar ou ordenar
   * muda os índices — a marcação passaria a apontar para outras NFs. Por isso, ao filtrar/ordenar (e ao buscar), a
   * seleção é LIMPA; e as NFs marcadas são sempre lidas dos índices selecionados pelos contextos do binding, de modo
   * que a soma mostrada e as NFs enviadas são exatamente as linhas que o usuário vê marcadas.
   */
  private clearInvoiceSelection(): void {
    this.invoicesTable()?.clearSelection();
    this.onInvoiceSelect();
  }

  private onInvoiceSelect(): void {
    const table = this.invoicesTable();
    this._selectedInvoices = (table?.getSelectedIndices() ?? [])
      .map((index) => table.getContextByIndex(index)?.getObject() as LinkableSapInvoice)
      .filter(Boolean);
    void this.refreshPreview();
  }

  /**
   * Monta a lista de liberações (do cliente da carga; com o switch, todas) e limpa a escolhida: a lista mudou. Com uma
   * única liberação visível, ela já vem escolhida.
   */
  private rebuildReleases(): void {
    const releasesTable = this.releasesTable();
    const showOthers = this.model().getProperty("/ShowOthers") === true;
    const releases = releasesForLoad(this._allReleases, this._load?.CardCode, showOthers);

    releasesTable?.clearSelection();
    this.model().setProperty("/Releases", releases);

    // A pré-seleção é por índice do binding: só vale quando a tabela (com o filtro de coluna do usuário) mostra
    // exatamente aquela liberação.
    if (preselectedReleaseIndex(releases) >= 0 && (releasesTable?.getBinding("rows") as ListBinding)?.getLength() === 1) {
      releasesTable.setSelectedIndex(0);
    }
    void this.refreshPreview();
  }

  private selectedRelease(): BilledRelease {
    const table = this.releasesTable();
    const index = table?.getSelectedIndex() ?? -1;
    return index < 0 ? undefined : table.getContextByIndex(index)?.getObject() as BilledRelease;
  }

  private setCanLink(): void {
    const model = this.model();
    model.setProperty("/CanLink",
      canLink(this._selectedInvoices, !!this.selectedRelease()) && !!this._preview && model.getProperty("/PreviewLoading") !== true);
  }

  /** Limpa o rodapé de valores e o aviso (a seleção não tem prévia válida). */
  private clearPreview(error = ""): void {
    const model = this.model();
    this._preview = undefined;
    model.setProperty("/PreviewVisible", false);
    model.setProperty("/PreviewLoading", false);
    model.setProperty("/PreviewError", error);
    model.setProperty("/DivergenceText", "");
    this.setCanLink();
  }

  /**
   * Pede ao servidor a prévia (efetivo x NF, tipo do vínculo) para as NFs e a liberação escolhidas. A resposta de uma
   * seleção antiga é descartada pelo token. Erro de negócio aparece uma vez na faixa do rodapé e mantém "Vincular" desabilitado.
   */
  private async refreshPreview(): Promise<void> {
    const requestId = ++this._previewId;
    const invoices = this._selectedInvoices.slice();
    const release = this.selectedRelease();
    this.clearPreview();
    if (!canLink(invoices, !!release) || !release?.SalesShipmentReleaseKey) {
      return;
    }

    const model = this.model();
    model.setProperty("/PreviewLoading", true);
    const func = (this.host.view.getModel() as ODataModel).bindContext("/ShipmentLoadsGetSapLinkPreview(...)");
    func.setParameter("Key", this._load.Key);
    func.setParameter("SalesShipmentReleaseKey", release.SalesShipmentReleaseKey);
    func.setParameter("SapDocEntries", invoices.map((invoice) => invoice.DocEntry).join(","));
    try {
      await func.invoke();
      if (isStaleRequest(requestId, this._previewId)) {
        return;
      }
      const preview = normalizeLinkPreview(func.getBoundContext().getObject());
      if (!preview) {
        this.clearPreview("Não foi possível calcular a prévia do vínculo.");
        return;
      }
      this._preview = preview;
      model.setProperty("/PreviewLoading", false);
      model.setProperty("/PreviewError", "");
      model.setProperty("/PreviewVisible", true);
      model.setProperty("/QuantityEffective", formatKg(preview.EffectiveQuantity));
      model.setProperty("/QuantityInvoice", formatKg(preview.InvoiceQuantity));
      model.setProperty("/QuantityDifference", formatKg(preview.QuantityDifference));
      model.setProperty("/ValueEffective", formatMoney(preview.EffectiveValue));
      model.setProperty("/ValueInvoice", formatMoney(preview.InvoiceValue));
      model.setProperty("/ValueDifference", formatMoney(preview.ValueDifference));
      model.setProperty("/DivergenceText", preview.LinkType === 2
        ? "Vínculo com divergência de quantidade e valor"
        : preview.LinkType === 1 ? "Vínculo com divergência de valor" : "");
      this.setCanLink();
    } catch (e) {
      if (!isStaleRequest(requestId, this._previewId)) {
        this.clearPreview((e as Error).message);
      }
    }
  }

  /** Pergunta de confirmação da divergência; "Não" ou fechar não faz nada. */
  private confirmDivergence(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      MessageBox.confirm(message, {
        title: "Divergência no vínculo",
        actions: ["Sim", "Não"],
        emphasizedAction: "Sim",
        onClose: (action: string) => resolve(action === "Sim"),
      });
    });
  }

  private async link(): Promise<void> {
    // Avaliada e setada ANTES do primeiro await: duplo clique em "Vincular" não envia duas requisições.
    if (this._linkInFlight) {
      return;
    }
    this._linkInFlight = true;

    try {
      const invoices = this._selectedInvoices.slice();
      const release = this.selectedRelease();
      const preview = this._preview;
      if (!canLink(invoices, !!release) || !preview) {
        return;
      }
      if (!release?.SalesShipmentReleaseKey) {
        MessageBox.warning("Selecione a liberação de entrega.");
        return;
      }

      if (preview.LinkType !== 0 && !(await this.confirmDivergence(preview.Message))) {
        return;
      }

      this._dialog.setBusy(true);
      const action = (this.host.view.getModel() as ODataModel).bindContext("/ShipmentLoadsLinkSapInvoice(...)");
      action.setParameter("Key", this._load.Key);
      action.setParameter("SapDocEntries", invoices.map((invoice) => invoice.DocEntry));
      action.setParameter("SalesShipmentReleaseKey", release.SalesShipmentReleaseKey);
      // Boolean não anulável no servidor: sempre true ou false, nunca nulo.
      action.setParameter("ConfirmDivergence", preview.LinkType !== 0);

      let created: LinkedDocument[];
      try {
        await action.invoke();
        created = normalizeLinkedDocuments(action.getBoundContext()?.getObject());
      } catch (e) {
        // Fica aberto para o usuário escolher outra NF/liberação; a mensagem é a do servidor.
        MessageBox.error((e as Error).message);
        return;
      } finally {
        this._dialog.setBusy(false);
      }

      this.close();
      MessageToast.show(created.length > 1
        ? `${created.length} notas fiscais do SAP vinculadas à carga.`
        : "NF do SAP vinculada à carga.");
      this.host.onLinked(created);
    } finally {
      this._linkInFlight = false;
    }
  }
}
