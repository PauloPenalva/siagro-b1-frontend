import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Fragment from "sap/ui/core/Fragment";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import formatter from "siagrob1/model/formatter";
import { BaseController } from "./BaseController";

/** Linha do diálogo de recusa — o DTO da function, mais a quantidade digitada. */
type RefusableDocument = {
  SalesInvoiceKey: string;
  InvoiceNumber?: string;
  RefusableQuantity: number;
  ReturnQuantity?: number;
};

type RefusalForm = {
  DestinationIndex: number;
  DestinationWarehouseCode?: string;
  DestinationWarehouseName?: string;
  Reason?: string;
  busy: boolean;
};

/**
 * @namespace siagrob1.controller.shipmentLoads
 */
export default class Detail extends BaseController {

  formatter = formatter;

  private _loadKey: string;

  private _refusalDialog: Dialog;

  private _refusalInFlight = false;

  onInit(): void {
    this.getRouter().getRoute("shipmentLoadsDetail")
      .attachPatternMatched((ev) => this.detailRouteMatched(ev));
  }

  private detailRouteMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    this._loadKey = id;
    this.bindElement(`/ShipmentLoads(${id})`);
  }

  async onRecalculate(): Promise<void> {
    const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsRecalculateInvoiced(...)");
    action.setParameter("Key", this._loadKey);

    this.setBusy(true);
    try {
      await action.invoke();
      this.refreshAll();
      MessageToast.show("Saldo recalculado.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  async onCancelLoad(): Promise<void> {
    const reason = await DialogHelper.promptDialog(
      "Cancelar Carga", "Informe o motivo do cancelamento:");

    if (!reason) return;

    const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsCancel(...)");
    action.setParameter("Key", this._loadKey);
    action.setParameter("CancellationReason", reason);

    this.setBusy(true);
    try {
      await action.invoke();
      this.refreshAll();
      MessageToast.show("Carga cancelada. Romaneios devolvidos à montagem.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Desvincula romaneios, devolvendo-os à lista de disponíveis.
   *
   * O backend recusa se houver documento de saída vivo na carga: encolher o volume por baixo de
   * uma nota já emitida furaria a invariante que o guard de faturamento não vigia — ele valida
   * o que entra, não o que sai. A mensagem de recusa vem de lá.
   */
  async onDetachShipments(): Promise<void> {
    const table = this.byId("loadTransactionsTable") as Table;
    const selected = table.getSelectedIndices();

    if (selected.length < 1) {
      MessageBox.warning("Selecione ao menos 1 romaneio para desvincular.");
      return;
    }

    if (!await DialogHelper.confirmDialog(
      `Desvincular ${selected.length} romaneio(s) desta carga ?`)) return;

    const keys = selected.map(i =>
      (table.getContextByIndex(i) as Context).getProperty("Key") as string);

    const action = (this.getModel() as ODataModel)
      .bindContext("/ShipmentLoadsDetachTransactions(...)");
    action.setParameter("Key", this._loadKey);
    action.setParameter("StorageTransactionKeys", keys);

    this.setBusy(true);
    try {
      await action.invoke();
      table.clearSelection();
      this.refreshAll();
      MessageToast.show(`${keys.length} romaneio(s) desvinculado(s).`);
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Abre o diálogo de recusa, carregando os documentos de saída ainda devolvíveis da carga.
   *
   * A quantidade a devolver já nasce preenchida com o saldo devolvível de cada documento (a
   * recusa total é o caso comum); quem recusa em parte só reduz o número, e quem não recusou um
   * documento zera a linha dele.
   */
  async onRefuse(): Promise<void> {
    const model = this.getModel() as ODataModel;
    const func = model.bindContext("/ShipmentLoadsGetRefusableDocuments(...)");
    func.setParameter("Key", this._loadKey);

    this.setBusy(true);
    try {
      await func.invoke();

      // getObject() de uma function que devolve COLEÇÃO entrega o envelope OData
      // ({ "@odata.context": ..., value: [...] }), e não o array — chamar .forEach direto
      // estoura "documents.forEach is not a function". Passa nos gates e só quebra no navegador.
      const result = func.getBoundContext().getObject() as { value?: RefusableDocument[] };

      const documents = result?.value ?? [];

      if (documents.length === 0) {
        MessageBox.warning(
          "Esta carga não tem documento de saída confirmado a devolver.");
        return;
      }

      documents.forEach(d => d.ReturnQuantity = d.RefusableQuantity);

      this.getView().setModel(new JSONModel(documents), "refusalDocs");
      this.getView().setModel(new JSONModel({
        DestinationIndex: 0,
        DestinationWarehouseCode: "",
        DestinationWarehouseName: "",
        Reason: "",
        busy: false,
      } as RefusalForm), "refusal");

      if (!this._refusalDialog) {
        this._refusalDialog = await Fragment.load({
          id: this.getView().getId(),
          name: "siagrob1.view.shipmentLoads.fragments.Refusal",
          controller: this,
        }) as Dialog;

        this.getView().addDependent(this._refusalDialog);
      }

      this._refusalDialog.open();
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Value help do armazém de destino, com escrita PRÓPRIA no model `refusal`.
   *
   * Não usa o `openWarehouseValueHelp` comum de propósito: aquele resolve o destino da
   * descrição por `oInput.getBindingContext()` SEM nome de model, e esta view tem element
   * binding OData (`/ShipmentLoads(...)`). O helper então tentava gravar
   * `DestinationWarehouseName` na entidade da carga e o OData recusava com
   * "Not a (navigation) property" — o diálogo escolhia o armazém e morria em seguida.
   * Nas telas de Add/Edit aquele helper funciona porque a página não tem contexto OData e ele
   * cai no ramo do JSON model.
   */
  async openRefusalWarehouseValueHelp(): Promise<void> {
    const selected = await DialogHelper.openTableSelectDialog(
      this, "WarehousesSelectDialog", ["Code", "Name", "TaxId", "FName"], []);

    if (!selected) return;

    const refusal = this.getView().getModel("refusal") as JSONModel;

    refusal.setProperty("/DestinationWarehouseCode", selected.getProperty("Code") as string);
    refusal.setProperty("/DestinationWarehouseName", selected.getProperty("Name") as string);
  }

  /**
   * Trocar para "segue para novo destino" limpa o armazém: deixá-lo preenchido e invisível
   * mandaria um código de armazém junto de uma recusa que não devolve nada a armazém nenhum.
   */
  onRefusalDestinationChange(): void {
    const refusal = this.getView().getModel("refusal") as JSONModel;

    if (refusal.getProperty("/DestinationIndex") !== 1) {
      refusal.setProperty("/DestinationWarehouseCode", "");
      refusal.setProperty("/DestinationWarehouseName", "");
    }
  }

  onCloseRefusal(): void {
    this._refusalDialog?.close();
  }

  async onConfirmRefusal(): Promise<void> {
    // Trava de reentrância avaliada e setada ANTES do primeiro await: um duplo clique enfileira
    // duas recusas do mesmo documento, e a segunda estouraria no meio do caminho.
    if (this._refusalInFlight) return;
    this._refusalInFlight = true;

    const refusalModel = this.getView().getModel("refusal") as JSONModel;
    const docsModel = this.getView().getModel("refusalDocs") as JSONModel;

    try {
      const form = refusalModel.getData() as RefusalForm;
      const documents = docsModel.getData() as RefusableDocument[];

      const lines = documents.filter(d => Number(d.ReturnQuantity ?? 0) > 0);

      if (lines.length === 0) {
        MessageBox.warning("Informe a quantidade a devolver de ao menos um documento de saída.");
        return;
      }

      const excess = lines.find(d => Number(d.ReturnQuantity) > d.RefusableQuantity);
      if (excess) {
        MessageBox.warning(
          `A quantidade a devolver do documento ${excess.InvoiceNumber} é maior que o ` +
          `saldo devolvível (${excess.RefusableQuantity.toLocaleString("pt-BR", { minimumFractionDigits: 3 })}).`);
        return;
      }

      if (!form.Reason?.trim()) {
        MessageBox.warning("Informe o motivo da recusa.");
        return;
      }

      const toWarehouse = form.DestinationIndex === 1;

      if (toWarehouse && !form.DestinationWarehouseCode?.trim()) {
        MessageBox.warning("Informe o armazém de destino da mercadoria devolvida.");
        return;
      }

      const confirmed = await DialogHelper.confirmDialog(
        toWarehouse
          ? "Confirma a recusa, devolvendo a mercadoria ao armazém informado ?"
          : "Confirma a recusa ? A carga voltará a ficar disponível para faturamento.");

      if (!confirmed) return;

      const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsRefuse(...)");
      action.setParameter("Key", this._loadKey);
      action.setParameter("SalesInvoiceKeys", lines.map(l => l.SalesInvoiceKey));
      action.setParameter("Quantities", lines.map(l => Number(l.ReturnQuantity)));
      action.setParameter("Destination", toWarehouse ? "Warehouse" : "Rebilling");
      action.setParameter("Reason", form.Reason.trim());
      // SEMPRE definido, nunca undefined: JSON.stringify omite chave undefined e o OData
      // rejeita o corpo inteiro por parâmetro faltando, sem dizer qual.
      action.setParameter(
        "DestinationWarehouseCode", toWarehouse ? form.DestinationWarehouseCode.trim() : "");

      refusalModel.setProperty("/busy", true);
      try {
        await action.invoke();
      } finally {
        refusalModel.setProperty("/busy", false);
      }

      this._refusalDialog.close();
      this.refreshAll();

      MessageToast.show(
        toWarehouse
          ? "Recusa registrada. Mercadoria devolvida ao armazém."
          : "Recusa registrada. Carga disponível para novo faturamento.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this._refusalInFlight = false;
    }
  }

  onNavBack(): void {
    this.navTo("shipmentLoads");
  }

  /**
   * Recarrega o cabeçalho e as quatro coleções. Elas só respondem a `refresh()` porque estão
   * bindadas com `$$ownRequest`; como `$expand` do pai, ficariam presas ao cache do elemento.
   */
  private refreshAll(): void {
    // O contexto do elemento é o do modelo V4 e sabe se recarregar; o tipo devolvido pela
    // view é o genérico, daí o cast.
    (this.getView().getBindingContext() as Context)?.refresh();

    [
      "loadTransactionsTable",
      "loadInvoicesTable",
      "loadMovementsTable",
      "loadRefusalReturnsTable",
    ].forEach(id => {
      const binding = (this.byId(id) as Table)?.getBinding("rows") as ODataListBinding;
      binding?.refresh();
    });
  }
}
