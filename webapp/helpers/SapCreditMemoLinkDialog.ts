import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import ManagedObject from "sap/ui/base/ManagedObject";
import Fragment from "sap/ui/core/Fragment";
import Controller from "sap/ui/core/mvc/Controller";
import View from "sap/ui/core/mvc/View";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import {
  canLinkCreditMemo, defaultReturnLinkPeriod, LinkableCreditMemo, normalizeLinkableCreditMemos, returnDocumentSummary, ReturnDocumentRow,
} from "siagrob1/helpers/SapCreditMemoLinkHelpers";

export type SapCreditMemoLinkHost = {
  view: View,
  /** Depois de vincular com sucesso: a tela da carga se atualiza. */
  onLinked(): void,
  /** Registra as `sap.ui.table.Table` do diálogo no layout de colunas por usuário. */
  registerTableLayouts(root: ManagedObject): void,
}

/** Estado do model "sapReturnLink". */
type SapReturnLinkState = {
  DateFrom: string,
  DateTo: string,
  /** "Devolução DV000031 — 30.000,000 kg". */
  ReturnText: string,
  CreditMemos: LinkableCreditMemo[],
  /** Há nota escolhida e a quantidade dela é diferente da devolução. */
  QuantityDiffers: boolean,
  CanLink: boolean,
}

/**
 * Diálogo "Vincular NF de devolução" da carga (GAC-1226): escolhe a NF de devolução emitida no SAP (A/R Credit
 * Memo) para um documento de devolução já confirmado. O vínculo só grava os dados fiscais; a recusa já moveu o
 * saldo quando foi registrada. O model do fragmento chama-se "sapReturnLink" para não colidir com o "sapLink" do
 * vínculo de venda.
 */
export default class SapCreditMemoLinkDialog {

  private _dialog: Dialog;
  private _loadKey: string;
  private _returnInvoice: ReturnDocumentRow;
  /** Trava de reentrância do vínculo — setada ANTES do primeiro await (duplo clique não manda duas requisições). */
  private _linkInFlight = false;
  /** Descarta resposta atrasada de uma busca quando outra já foi disparada (ou o diálogo reabriu). */
  private _searchId = 0;

  /** Controller do fragmento: handlers como funções do próprio helper. */
  private readonly _fragmentController = {
    onSearch: (): void => void this.search(),
    onSelect: (): void => this.updateCanLink(),
    onFilterOrSort: (): void => this.clearSelection(),
    onLink: (): Promise<void> => this.link(),
    onCancel: (): void => this.close(),
  };

  constructor(private readonly host: SapCreditMemoLinkHost) {
    host.view.setModel(new JSONModel(this.emptyState()), "sapReturnLink");
  }

  async open(loadKey: string, returnInvoice: ReturnDocumentRow): Promise<void> {
    this._loadKey = loadKey;
    this._returnInvoice = returnInvoice;
    this._searchId++;
    this.model().setData(this.emptyState());

    await this.ensureDialog();
    this.table().clearSelection();
    this.updateCanLink();
    this._dialog.open();

    await this.search();
  }

  close(): void {
    this._searchId++;
    this._dialog?.close();
  }

  private emptyState(): SapReturnLinkState {
    return {
      ...defaultReturnLinkPeriod(this._returnInvoice?.InvoiceDate),
      ReturnText: returnDocumentSummary(this._returnInvoice ?? {}),
      CreditMemos: [], QuantityDiffers: false, CanLink: false,
    };
  }

  private model(): JSONModel {
    return this.host.view.getModel("sapReturnLink") as JSONModel;
  }

  private table(): Table {
    return this.host.view.byId("sapReturnLinkTable") as Table;
  }

  private async ensureDialog(): Promise<void> {
    if (this._dialog) {
      return;
    }
    this._dialog = await Fragment.load({
      id: this.host.view.getId(),
      name: "siagrob1.view.shipmentLoads.fragments.SapCreditMemoLinkDialog",
      controller: this._fragmentController as unknown as Controller,
    }) as unknown as Dialog;
    this.host.view.addDependent(this._dialog);
    // Ordem e largura das colunas por usuário (ids estáveis no fragmento).
    this.host.registerTableLayouts(this._dialog);
  }

  private async search(): Promise<void> {
    const model = this.model();
    const requestId = ++this._searchId;

    // Resultado anterior some junto com a escolha dele: a seleção da tabela é por posição.
    model.setProperty("/CreditMemos", []);
    this.clearSelection();

    const func = (this.host.view.getModel() as ODataModel).bindContext("/ShipmentLoadsGetLinkableSapCreditMemos(...)");
    func.setParameter("Key", this._loadKey);
    func.setParameter("SalesInvoiceKey", this._returnInvoice.Key);
    // Parâmetros string no formato yyyy-MM-dd (o backend não aceita Edm.Date aqui).
    func.setParameter("DateFrom", model.getProperty("/DateFrom") as string);
    func.setParameter("DateTo", model.getProperty("/DateTo") as string);

    this._dialog.setBusy(true);
    try {
      await func.invoke();
      if (requestId !== this._searchId) {
        return;
      }
      model.setProperty("/CreditMemos", normalizeLinkableCreditMemos(func.getBoundContext().getObject()));
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

  /**
   * A seleção da `sap.ui.table.Table` é por ÍNDICE do binding, e filtrar ou ordenar muda os índices — a marcação
   * passaria a apontar para outra nota. Por isso é limpa ao filtrar, ordenar e buscar.
   */
  private clearSelection(): void {
    this.table()?.clearSelection();
    this.updateCanLink();
  }

  private selected(): LinkableCreditMemo {
    const table = this.table();
    const index = table?.getSelectedIndex() ?? -1;
    return index < 0 ? undefined : table.getContextByIndex(index)?.getObject() as LinkableCreditMemo;
  }

  private updateCanLink(): void {
    const selected = this.selected();
    this.model().setProperty("/QuantityDiffers", !!selected && selected.QuantityMatches !== true);
    this.model().setProperty("/CanLink", canLinkCreditMemo(selected));
  }

  private async link(): Promise<void> {
    // Avaliada e setada ANTES do primeiro await: duplo clique em "Vincular" não envia duas requisições.
    if (this._linkInFlight) {
      return;
    }
    this._linkInFlight = true;

    try {
      const selected = this.selected();
      if (!canLinkCreditMemo(selected)) {
        return;
      }

      this._dialog.setBusy(true);
      const action = (this.host.view.getModel() as ODataModel).bindContext("/ShipmentLoadsLinkSapCreditMemo(...)");
      action.setParameter("Key", this._loadKey);
      action.setParameter("SalesInvoiceKey", this._returnInvoice.Key);
      action.setParameter("SapDocEntry", selected.DocEntry);

      try {
        await action.invoke();
      } catch (e) {
        // Fica aberto para o usuário escolher outra nota; a mensagem é a do servidor.
        MessageBox.error((e as Error).message);
        return;
      } finally {
        this._dialog.setBusy(false);
      }

      this.close();
      MessageToast.show("NF de devolução do SAP vinculada.");
      this.host.onLinked();
    } finally {
      this._linkInFlight = false;
    }
  }
}
