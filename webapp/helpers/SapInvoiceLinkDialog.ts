import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Table from "sap/m/Table";
import Fragment from "sap/ui/core/Fragment";
import Controller from "sap/ui/core/mvc/Controller";
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import { BilledRelease, requestAvailableSalesReleases } from "siagrob1/helpers/ShipmentBillingDialog";
import {
  defaultLinkPeriod, filterReleasesByCustomer, isStaleRequest, LinkableSapInvoice, normalizeLinkableInvoices, preselectedReleaseIndex,
} from "siagrob1/helpers/SapInvoiceLinkHelpers";

/** Carga a vincular — os campos que o diálogo usa. */
export type SapLinkLoad = { Key: string, Code: string, ItemCode: string }

/** Documento de saída criado pelo vínculo (resposta camelCase da action, igual à do faturamento). */
export type LinkedDocument = { key: string, invoiceNumber: string };

export type SapInvoiceLinkHost = {
  view: View,
  /** Depois de vincular com sucesso: a tela atualiza a carga e leva o usuário ao documento criado. */
  onLinked(created: LinkedDocument): void,
}

/** Estado do model "sapLink". */
type SapLinkState = {
  DateFrom: string,
  DateTo: string,
  Invoices: LinkableSapInvoice[],
  Releases: BilledRelease[],
  /** Há NF e liberação escolhidas: habilita "Vincular". */
  CanLink: boolean,
}

/**
 * Diálogo "Vincular NF do SAP" da carga (GAC-1226): escolhe uma NF do SAP ainda não vinculada e a liberação de
 * entrega do cliente dela; o backend cria o documento de saída a partir da NF. O model do fragmento chama-se
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
  private _selectedInvoice: LinkableSapInvoice;

  /** Controller do fragmento: handlers como funções do próprio helper. */
  private readonly _fragmentController = {
    onSearch: (): void => void this.search(),
    onInvoiceSelect: (): void => this.onInvoiceSelect(),
    onReleaseSelect: (): void => this.updateCanLink(),
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
    this._selectedInvoice = undefined;
    this.model().setData(this.emptyState());

    await this.ensureDialog();
    (this.byId("sapLinkInvoicesTable") as Table).removeSelections(true);
    (this.byId("sapLinkReleasesTable") as Table).removeSelections(true);
    this._dialog.open();

    await Promise.all([this.search(), this.loadReleases()]);
  }

  close(): void {
    this._searchId++;
    this._openId++;
    this._dialog?.close();
  }

  private emptyState(): SapLinkState {
    return { ...defaultLinkPeriod(), Invoices: [], Releases: [], CanLink: false };
  }

  private model(): JSONModel {
    return this.host.view.getModel("sapLink") as JSONModel;
  }

  private byId(id: string) {
    return this.host.view.byId(id);
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
  }

  /** NF do SAP do período escolhido (a function já traz só as de quantidade igual ao saldo da carga). */
  private async search(): Promise<void> {
    const model = this.model();
    const requestId = ++this._searchId;

    // Resultado anterior some junto com a escolha dele: a seleção da tabela é por posição.
    this._selectedInvoice = undefined;
    (this.byId("sapLinkInvoicesTable") as Table)?.removeSelections(true);
    model.setProperty("/Invoices", []);
    this.applyReleaseFilter();

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

  private onInvoiceSelect(): void {
    const table = this.byId("sapLinkInvoicesTable") as Table;
    this._selectedInvoice = table.getSelectedItem()?.getBindingContext("sapLink")?.getObject() as LinkableSapInvoice;
    this.applyReleaseFilter();
  }

  /** Liberações do cliente da NF escolhida; com uma só, já vem escolhida. */
  private applyReleaseFilter(): void {
    const releasesTable = this.byId("sapLinkReleasesTable") as Table;
    const filtered = filterReleasesByCustomer(this._allReleases, this._selectedInvoice?.CardCode);

    releasesTable?.removeSelections(true);
    this.model().setProperty("/Releases", filtered);

    const index = preselectedReleaseIndex(filtered);
    if (index >= 0) {
      const item = releasesTable?.getItems()[index];
      if (item) {
        releasesTable.setSelectedItem(item, true);
      }
    }
    this.updateCanLink();
  }

  private selectedRelease(): BilledRelease {
    const table = this.byId("sapLinkReleasesTable") as Table;
    return table?.getSelectedItem()?.getBindingContext("sapLink")?.getObject() as BilledRelease;
  }

  private updateCanLink(): void {
    this.model().setProperty("/CanLink", !!this._selectedInvoice && !!this.selectedRelease());
  }

  private async link(): Promise<void> {
    // Avaliada e setada ANTES do primeiro await: duplo clique em "Vincular" não envia duas requisições.
    if (this._linkInFlight) {
      return;
    }
    this._linkInFlight = true;

    try {
      const invoice = this._selectedInvoice;
      const release = this.selectedRelease();
      if (!invoice) {
        return;
      }
      if (!release?.SalesShipmentReleaseKey) {
        MessageBox.warning("Selecione a liberação de entrega.");
        return;
      }

      this._dialog.setBusy(true);
      const action = (this.host.view.getModel() as ODataModel).bindContext("/ShipmentLoadsLinkSapInvoice(...)");
      action.setParameter("Key", this._load.Key);
      action.setParameter("SapDocEntry", invoice.DocEntry);
      action.setParameter("SalesShipmentReleaseKey", release.SalesShipmentReleaseKey);

      let created: LinkedDocument;
      try {
        await action.invoke();
        created = action.getBoundContext()?.getObject() as LinkedDocument;
      } catch (e) {
        // Fica aberto para o usuário escolher outra NF/liberação; a mensagem é a do servidor.
        MessageBox.error((e as Error).message);
        return;
      } finally {
        this._dialog.setBusy(false);
      }

      this.close();
      MessageToast.show("NF do SAP vinculada à carga.");
      this.host.onLinked(created);
    } finally {
      this._linkInFlight = false;
    }
  }
}
