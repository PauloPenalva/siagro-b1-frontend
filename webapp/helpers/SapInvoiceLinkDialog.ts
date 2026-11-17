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
  canLink, defaultLinkPeriod, exceedsAvailable, hasMixedCustomers, isStaleRequest, LinkableSapInvoice, LinkedDocument, matchesAvailable,
  normalizeLinkableInvoices, normalizeLinkedDocuments, preselectedReleaseIndex, releasesForInvoices, selectionSummaryText,
  sumQuantity,
} from "siagrob1/helpers/SapInvoiceLinkHelpers";

/** Carga a vincular — os campos que o diálogo usa. */
export type SapLinkLoad = { Key: string, Code: string, ItemCode: string, AvailableQuantity: number }

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
  /** Rodapé "Selecionado: … kg de … kg". */
  SummaryText: string,
  /** Soma marcada igual ao saldo da carga. */
  SumMatches: boolean,
  /** Soma marcada maior que o saldo: rodapé em erro. */
  SumExceeds: boolean,
  /** Há NF marcada e a soma é menor que o saldo: rodapé em aviso. */
  SumBelow: boolean,
  /** NFs marcadas de mais de um cliente: rodapé em erro. */
  MixedCustomers: boolean,
  /** NFs do mesmo cliente com soma igual ao saldo e liberação escolhida: habilita "Vincular". */
  CanLink: boolean,
}

/**
 * Diálogo "Vincular NF do SAP" da carga (GAC-1226): escolhe uma ou mais NFs do SAP ainda não vinculadas, do mesmo
 * cliente e com soma igual ao saldo da carga, e uma liberação de entrega desse cliente; o backend cria um documento
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
  /** Todas as liberações disponíveis do item; o model mostra só as do cliente da NF escolhida. */
  private _allReleases: BilledRelease[] = [];
  /** NFs marcadas, lidas dos índices selecionados pelos contextos do binding (o que o usuário vê marcado). */
  private _selectedInvoices: LinkableSapInvoice[] = [];

  /** Controller do fragmento: handlers como funções do próprio helper. */
  private readonly _fragmentController = {
    onSearch: (): void => void this.search(),
    onInvoiceSelect: (): void => this.onInvoiceSelect(),
    onReleaseSelect: (): void => this.updateCanLink(),
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
    this.model().setData(this.emptyState());

    await this.ensureDialog();
    this.invoicesTable().clearSelection();
    this.releasesTable().clearSelection();
    this.updateCanLink();
    this._dialog.open();

    await Promise.all([this.search(), this.loadReleases()]);
  }

  close(): void {
    this._searchId++;
    this._openId++;
    this._dialog?.close();
  }

  private emptyState(): SapLinkState {
    return {
      ...defaultLinkPeriod(), Invoices: [], Releases: [], SummaryText: selectionSummaryText(0, this._load?.AvailableQuantity),
      SumMatches: false, SumExceeds: false, SumBelow: false, MixedCustomers: false, CanLink: false,
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

  /** NF do SAP do período escolhido (a function traz as de quantidade maior que zero e até o saldo da carga). */
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
      this._allReleases = releases;
      // Se a NF já foi escolhida enquanto as liberações carregavam, refaz o filtro e a pré-seleção dela.
      this.applyReleaseFilter();
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
    this.applyReleaseFilter();
  }

  /** Liberações do cliente das NFs marcadas (clientes misturados: nenhuma); com uma só, já vem escolhida. */
  private applyReleaseFilter(): void {
    const releasesTable = this.releasesTable();
    const filtered = releasesForInvoices(this._allReleases, this._selectedInvoices);

    releasesTable?.clearSelection();
    this.model().setProperty("/Releases", filtered);

    // A pré-seleção é por índice do binding: só vale quando a tabela (com o filtro de coluna do usuário) mostra
    // exatamente aquela liberação.
    if (preselectedReleaseIndex(filtered) >= 0 && (releasesTable?.getBinding("rows") as ListBinding)?.getLength() === 1) {
      releasesTable.setSelectedIndex(0);
    }
    this.updateCanLink();
  }

  private selectedRelease(): BilledRelease {
    const table = this.releasesTable();
    const index = table?.getSelectedIndex() ?? -1;
    return index < 0 ? undefined : table.getContextByIndex(index)?.getObject() as BilledRelease;
  }

  private updateCanLink(): void {
    const model = this.model();
    const invoices = this._selectedInvoices;
    const available = this._load?.AvailableQuantity;
    const sum = sumQuantity(invoices);
    model.setProperty("/SummaryText", selectionSummaryText(sum, available));
    model.setProperty("/SumMatches", invoices.length > 0 && matchesAvailable(sum, available));
    model.setProperty("/SumExceeds", exceedsAvailable(sum, available));
    model.setProperty("/SumBelow", invoices.length > 0 && !exceedsAvailable(sum, available) && !matchesAvailable(sum, available));
    model.setProperty("/MixedCustomers", hasMixedCustomers(invoices));
    model.setProperty("/CanLink", canLink(invoices, available, !!this.selectedRelease()));
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
      if (!canLink(invoices, this._load?.AvailableQuantity, !!release)) {
        return;
      }
      if (!release?.SalesShipmentReleaseKey) {
        MessageBox.warning("Selecione a liberação de entrega.");
        return;
      }

      this._dialog.setBusy(true);
      const action = (this.host.view.getModel() as ODataModel).bindContext("/ShipmentLoadsLinkSapInvoice(...)");
      action.setParameter("Key", this._load.Key);
      action.setParameter("SapDocEntries", invoices.map((invoice) => invoice.DocEntry));
      action.setParameter("SalesShipmentReleaseKey", release.SalesShipmentReleaseKey);

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
