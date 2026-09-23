import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Fragment from "sap/ui/core/Fragment";
import { Route$MatchedEvent } from "sap/ui/core/routing/Route";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import SapMTable from "sap/m/Table";
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

/** Romaneio selecionado no grid, lido do contexto (getObject + acesso opcional). */
type ChangeReleaseRow = {
  Key: string;
  Code: string;
  GrossWeight: number;
  ItemCode: string;
  WarehouseCode: string;
  WarehouseName?: string;
  ShipmentReleaseKey: string;
  ContractCode?: string;
  CardName?: string;
  NewContractCode?: string;
  NewCardName?: string;
  NewWarehouseCode?: string;
  NewWarehouseName?: string;
};

type ReleaseTarget = { ShipmentReleaseKey: string };

type ChangeReleaseForm = {
  IsSwap: boolean;
  Rows: ChangeReleaseRow[];
  Targets: ReleaseTarget[];
  Reason: string;
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

  private _changeReleaseDialog: Dialog;

  private _changeReleaseInFlight = false;

  onInit(): void {
    this.getRouter().getRoute("shipmentLoadsDetail")
      .attachPatternMatched((ev) => this.detailRouteMatched(ev));
  }

  private detailRouteMatched(ev: Route$MatchedEvent): void {
    const { id } = ev.getParameter("arguments") as { id: string };
    if (id == null) return;

    this._loadKey = id;
    this.bindElement(`/ShipmentLoads(${id})`);

    // Passa a chave explícita: bindElement não espera a resposta, e currentLoadKey() leria a
    // Key de um contexto ainda sem dados nesta primeira chamada. `.catch()` em vez de `void`: uma
    // falha aqui não pode virar uma rejeição não tratada silenciosa. Mesmo motivo para a
    // situação dos transbordos (GAC-1181, Task 11) — precisa da chave explícita pelo mesmo motivo.
    this.refreshAttachments(id).catch(
      () => MessageBox.error("Erro ao carregar os anexos da carga."));
    this.refreshTransshipmentLinkage(id).catch(
      () => MessageBox.error("Erro ao carregar a situação dos transbordos."));
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
   * Conclui a carga de remoção (GAC-1175). O encerramento é manual porque a remoção não tem
   * faturamento que a feche — e por isso vem com Reabrir ao lado, para o clique errado não
   * custar o cancelamento da carga.
   */
  async onCompleteLoad(): Promise<void> {
    if (!await DialogHelper.confirmDialog(
      "Concluir esta carga de remoção ? Ela deixará de aceitar novas entradas.")) return;

    await this.invokeLoadAction("/ShipmentLoadsComplete(...)", "Carga concluída.");
  }

  async onReopenLoad(): Promise<void> {
    if (!await DialogHelper.confirmDialog("Reabrir esta carga de remoção ?")) return;

    await this.invokeLoadAction("/ShipmentLoadsReopen(...)", "Carga reaberta.");
  }

  /** Action que só recebe a chave da carga — o formato de Concluir e Reabrir. */
  private async invokeLoadAction(actionPath: string, successMessage: string): Promise<void> {
    const action = (this.getModel() as ODataModel).bindContext(actionPath);
    action.setParameter("Key", this._loadKey);

    this.setBusy(true);
    try {
      await action.invoke();
      this.refreshAll();
      MessageToast.show(successMessage);
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Só romaneios VIGENTES (Expedição, sem terem sido substituídos por uma troca de liberação)
   * podem ser desvinculados ou trocados — a Original substituída, o Estorno e a Expedição de
   * troca de outra troca já não representam o embarque corrente da carga (GAC-1177 v2).
   */
  private isVigenteRow(context: Context): boolean {
    const type = context.getProperty("TransactionType") as string;
    const replacedBy = context.getProperty("ReplacedByShippingReleaseChangeKey") as string;

    // GAC-1175: cada natureza de carga tem o seu tipo de romaneio, e só ele é desvinculável.
    // Na Remoção não existe troca de liberação, então `replacedBy` é sempre nulo lá.
    const loadType = this.getView().getBindingContext()?.getProperty("LoadType") as string;
    const expected = loadType === "Removal" ? "Receipt" : "SalesShipment";

    return type === expected && !replacedBy;
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

    const contexts = selected.map(i => table.getContextByIndex(i) as Context);

    if (contexts.some(c => !this.isVigenteRow(c))) {
      MessageBox.warning("Selecione apenas romaneios vigentes da carga.");
      return;
    }

    if (!await DialogHelper.confirmDialog(
      `Desvincular ${selected.length} romaneio(s) desta carga ?`)) return;

    const keys = contexts.map(c => c.getProperty("Key") as string);

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
   * Troca a liberação (contrato de compra) de 1 romaneio, ou inverte a de 2 (GAC-1177 v2).
   * Gera um estorno (12) na origem e uma nova Expedição (7) no destino, com a data da carga;
   * pode ajustar o peso total da carga pela regra da quantidade. O backend valida saldo,
   * contrato encerrado e liberação ativa, e registra o motivo na Movimentação.
   */
  async onChangeRelease(): Promise<void> {
    const table = this.byId("loadTransactionsTable") as Table;
    const selected = table.getSelectedIndices();

    if (selected.length < 1 || selected.length > 2) {
      MessageBox.warning(
        "Selecione 1 romaneio para trocar a liberação ou 2 romaneios para inverter as liberações entre eles.");
      return;
    }

    const contexts = selected.map(i => table.getContextByIndex(i) as Context);

    if (contexts.some(c => !this.isVigenteRow(c))) {
      MessageBox.warning("Selecione apenas romaneios vigentes da carga.");
      return;
    }

    // getObject + acesso opcional: getProperty("Nav/Campo") estoura com navegação nula.
    const rows: ChangeReleaseRow[] = contexts.map(context => {
      const o = context.getObject() as {
        Key: string; Code: string; GrossWeight: number; ItemCode: string; WarehouseCode: string;
        WarehouseName?: string; ShipmentReleaseKey: string; CardName?: string;
        ShipmentRelease?: { PurchaseContract?: { Code?: string } };
      };
      return {
        Key: o.Key,
        Code: o.Code,
        GrossWeight: o.GrossWeight,
        ItemCode: o.ItemCode,
        WarehouseCode: o.WarehouseCode,
        WarehouseName: o.WarehouseName,
        ShipmentReleaseKey: o.ShipmentReleaseKey,
        ContractCode: o.ShipmentRelease?.PurchaseContract?.Code,
        CardName: o.CardName,
      };
    });

    if (rows.some(r => !r.ShipmentReleaseKey)) {
      MessageBox.warning("Há romaneio selecionado sem liberação de embarque.");
      return;
    }

    const isSwap = rows.length === 2;

    if (isSwap) {
      if (rows[0].ShipmentReleaseKey === rows[1].ShipmentReleaseKey) {
        MessageBox.warning("Os dois romaneios já estão na mesma liberação: não há o que inverter.");
        return;
      }
      rows[0].NewContractCode = rows[1].ContractCode;
      rows[0].NewCardName = rows[1].CardName;
      rows[0].NewWarehouseCode = rows[1].WarehouseCode;
      rows[0].NewWarehouseName = rows[1].WarehouseName;
      rows[1].NewContractCode = rows[0].ContractCode;
      rows[1].NewCardName = rows[0].CardName;
      rows[1].NewWarehouseCode = rows[0].WarehouseCode;
      rows[1].NewWarehouseName = rows[0].WarehouseName;
    }

    this.setBusy(true);
    try {
      let targets: ReleaseTarget[] = [];

      if (!isSwap) {
        const func = (this.getModel() as ODataModel)
          .bindContext("/ShipmentReleasesGetPurchaseContracts(...)");
        func.setParameter("ItemCode", rows[0].ItemCode);
        // "" = todos os armazéns: a troca simples não fica presa ao armazém da Expedição
        // original, e a function exige o parâmetro explícito (não aceita omiti-lo).
        func.setParameter("WarehouseCode", "");
        await func.invoke();

        // Coleção pode chegar como array ou como envelope { value: [...] }.
        const result = func.getBoundContext().getObject() as ReleaseTarget[] | { value?: ReleaseTarget[] };
        const all = Array.isArray(result) ? result : result?.value ?? [];
        targets = all.filter(t => t.ShipmentReleaseKey?.toLowerCase() !== rows[0].ShipmentReleaseKey.toLowerCase());
      }

      this.getView().setModel(new JSONModel({
        IsSwap: isSwap, Rows: rows, Targets: targets, Reason: "", busy: false,
      } as ChangeReleaseForm), "changeRelease");

      if (!this._changeReleaseDialog) {
        this._changeReleaseDialog = await Fragment.load({
          id: this.getView().getId(),
          name: "siagrob1.view.shipmentLoads.fragments.ChangeRelease",
          controller: this,
        }) as Dialog;
        this.getView().addDependent(this._changeReleaseDialog);
      }

      (this.byId("changeReleaseTargets") as SapMTable).removeSelections(true);
      this._changeReleaseDialog.open();
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      this.setBusy(false);
    }
  }

  async onConfirmChangeRelease(): Promise<void> {
    // Trava ANTES do primeiro await: duplo clique dispararia duas trocas.
    if (this._changeReleaseInFlight) return;

    const form = this.getView().getModel("changeRelease") as JSONModel;
    const data = form.getData() as ChangeReleaseForm;

    if (!data.Reason?.trim()) {
      MessageBox.warning("Informe o motivo da troca.");
      return;
    }

    let salesKeys: string[];
    let targetKeys: string[];

    if (data.IsSwap) {
      salesKeys = [data.Rows[0].Key, data.Rows[1].Key];
      targetKeys = [data.Rows[1].ShipmentReleaseKey, data.Rows[0].ShipmentReleaseKey];
    } else {
      const item = (this.byId("changeReleaseTargets") as SapMTable).getSelectedItem();
      if (!item) {
        MessageBox.warning("Selecione a liberação de destino.");
        return;
      }
      const target = item.getBindingContext("changeRelease").getObject() as ReleaseTarget;
      salesKeys = [data.Rows[0].Key];
      targetKeys = [target.ShipmentReleaseKey];
    }

    this._changeReleaseInFlight = true;
    form.setProperty("/busy", true);

    const action = (this.getModel() as ODataModel).bindContext("/ShippingTransactionsChangeRelease(...)");
    action.setParameter("SalesStorageTransactionKeys", salesKeys);
    action.setParameter("TargetShipmentReleaseKeys", targetKeys);
    action.setParameter("Reason", data.Reason.trim());

    try {
      await action.invoke();
      this._changeReleaseDialog.close();
      (this.byId("loadTransactionsTable") as Table).clearSelection();
      this.refreshAll();
      MessageToast.show(data.IsSwap ? "Liberações invertidas." : "Liberação trocada.");
    } catch (e) {
      MessageBox.error((e as Error).message);
    } finally {
      form.setProperty("/busy", false);
      this._changeReleaseInFlight = false;
    }
  }

  onCloseChangeRelease(): void {
    this._changeReleaseDialog.close();
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

        // O diálogo renderiza por conta própria e não passa pelo `onBeforeRendering` da view.
        this.registerTableLayouts(this._refusalDialog);
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
   * mandaria um código de armazém junto de uma recusa que não devolve nada a armazém nenhum. Os
   * índices 1 (armazém) e 2 (transbordo, GAC-1181 Task 11) são os dois que MANTÊM o armazém.
   */
  onRefusalDestinationChange(): void {
    const refusal = this.getView().getModel("refusal") as JSONModel;
    const index = refusal.getProperty("/DestinationIndex") as number;

    if (index !== 1 && index !== 2) {
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
      // GAC-1181, Task 11: terceiro destino — mesma exigência de armazém do índice 1.
      const toTransshipment = form.DestinationIndex === 2;
      const needsWarehouse = toWarehouse || toTransshipment;

      if (needsWarehouse && !form.DestinationWarehouseCode?.trim()) {
        MessageBox.warning("Informe o armazém de destino da mercadoria devolvida.");
        return;
      }

      const confirmed = await DialogHelper.confirmDialog(
        toTransshipment
          ? "Confirma a recusa ? A mercadoria seguirá para transbordo no armazém informado."
          : toWarehouse
            ? "Confirma a recusa, devolvendo a mercadoria ao armazém informado ?"
            : "Confirma a recusa ? A carga voltará a ficar disponível para faturamento.");

      if (!confirmed) return;

      const action = (this.getModel() as ODataModel).bindContext("/ShipmentLoadsRefuse(...)");
      action.setParameter("Key", this._loadKey);
      action.setParameter("SalesInvoiceKeys", lines.map(l => l.SalesInvoiceKey));
      action.setParameter("Quantities", lines.map(l => Number(l.ReturnQuantity)));
      action.setParameter(
        "Destination", toTransshipment ? "Transshipment" : toWarehouse ? "Warehouse" : "Rebilling");
      action.setParameter("Reason", form.Reason.trim());
      // SEMPRE definido, nunca undefined: JSON.stringify omite chave undefined e o OData
      // rejeita o corpo inteiro por parâmetro faltando, sem dizer qual. O terceiro destino segue
      // a mesma regra do armazém comum.
      action.setParameter(
        "DestinationWarehouseCode", needsWarehouse ? form.DestinationWarehouseCode.trim() : "");

      refusalModel.setProperty("/busy", true);
      try {
        await action.invoke();
      } finally {
        refusalModel.setProperty("/busy", false);
      }

      this._refusalDialog.close();
      this.refreshAll();

      MessageToast.show(
        toTransshipment
          ? "Recusa registrada. Mercadoria seguirá para transbordo no armazém informado."
          : toWarehouse
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

  /* ------------------------------------------------------------------ */
  /* Comentários                                                         */
  /* ------------------------------------------------------------------ */

  private _commentDialog: Dialog;

  private selectedCommentContext(): Context | null {
    const table = this.byId("shipmentLoadCommentsTable") as Table;
    const selected = table.getSelectedIndex();

    if (selected < 0) {
      MessageBox.alert("Selecione um comentário.");
      return null;
    }

    return table.getContextByIndex(selected) as Context;
  }

  /**
   * Autor ou admin. A permissão é decidida no SERVIDOR; isto só evita a viagem inútil.
   */
  private canModifyComment(context: Context): boolean {
    const sessionModel = this.getModel("sessionModel") as JSONModel;

    if (sessionModel?.getProperty("/isAdmin") === true) {
      return true;
    }

    const userName = (sessionModel?.getProperty("/userName") as string) ?? "";
    const author = (context.getProperty("CommentedBy") as string) ?? "";

    return userName !== "" && author.toLowerCase() === userName.toLowerCase();
  }

  /**
   * O diálogo trabalha sobre um buffer JSON, nunca sobre o contexto OData: two-way binding num
   * Detail deixaria um PATCH pendente no update group diferido e derrubaria o batch inteiro.
   * `key` nulo significa inclusão.
   */
  private prepareCommentDialog(title: string, text: string, key: string): void {
    (this.getModel("viewModel") as JSONModel).setProperty("/commentDialog", {
      title,
      text: text ?? "",
      key,
    });
  }

  private async openCommentDialog(): Promise<void> {
    this._commentDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.shipmentLoads.fragments.ShipmentLoadCommentDialog"
    );

    this._commentDialog.open();
  }

  /**
   * Recarrega a tabela de comentários (cache próprio, por `$$ownRequest`) e o log de alterações:
   * toda mutação de comentário grava linha no log.
   */
  private refreshCommentsList(): void {
    ["shipmentLoadCommentsTable", "shipmentLoadChangeLogsTable"].forEach(id => {
      const binding = (this.byId(id) as Table)?.getBinding("rows") as ODataListBinding;
      binding?.refresh();
    });
  }

  async onAddComment(): Promise<void> {
    if (!this.getView().getBindingContext()) {
      MessageBox.alert("Carga não carregada.");
      return;
    }

    this.prepareCommentDialog("Novo Comentário", "", null);
    await this.openCommentDialog();
  }

  async onEditComment(): Promise<void> {
    const context = this.selectedCommentContext();

    if (!context) return;

    if (!this.canModifyComment(context)) {
      MessageBox.alert("Somente o autor do comentário pode alterá-lo.");
      return;
    }

    this.prepareCommentDialog(
      "Editar Comentário",
      context.getProperty("CommentText") as string,
      context.getProperty("Key") as string
    );

    await this.openCommentDialog();
  }

  onCloseCommentDialog(): void {
    this._commentDialog?.close();
  }

  async onConfirmComment(): Promise<void> {
    const viewModel = this.getModel("viewModel") as JSONModel;
    const text = ((viewModel.getProperty("/commentDialog/text") as string) ?? "").trim();

    if (text === "") {
      MessageBox.alert("Informe o texto do comentário.");
      return;
    }

    const commentKey = viewModel.getProperty("/commentDialog/key") as string;

    this.onCloseCommentDialog();
    this.setBusy(true);

    try {
      const model = this.getModel() as ODataModel;

      if (commentKey) {
        const action = model.bindContext("/ShipmentLoadsCommentUpdate(...)");
        action.setParameter("Key", commentKey);
        action.setParameter("Text", text);
        await action.invoke();
        MessageToast.show("Comentário alterado.");
      } else {
        const action = model.bindContext("/ShipmentLoadsCommentCreate(...)");
        action.setParameter("LoadKey", this._loadKey);
        action.setParameter("Text", text);
        await action.invoke();
        MessageToast.show("Comentário incluído.");
      }

      this.refreshCommentsList();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao gravar o comentário.");
    } finally {
      this.setBusy(false);
    }
  }

  async onRemoveComment(): Promise<void> {
    const context = this.selectedCommentContext();

    if (!context) return;

    if (!this.canModifyComment(context)) {
      MessageBox.alert("Somente o autor do comentário pode excluí-lo.");
      return;
    }

    if (!await DialogHelper.confirmDialog("Excluir o comentário selecionado ?")) return;

    this.setBusy(true);

    try {
      const action = (this.getModel() as ODataModel)
        .bindContext("/ShipmentLoadsCommentDelete(...)");
      action.setParameter("Key", context.getProperty("Key") as string);
      await action.invoke();

      MessageToast.show("Comentário excluído.");
      this.refreshCommentsList();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao excluir o comentário.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Recarrega o cabeçalho e as coleções. Elas só respondem a `refresh()` porque estão
   * bindadas com `$$ownRequest`; como `$expand` do pai, ficariam presas ao cache do elemento.
   */
  private refreshAll(): void {
    // ⚠️ Lida ANTES do `refresh()` abaixo: o refresh invalida o cache da entidade e, no mesmo
    // tick, `getProperty("Key")` volta `undefined` — o que já mandou `LoadKey=undefined` ao
    // servidor e devolveu 404 na cara do usuário. Mesmo cuidado de `refreshDischarges()`.
    const loadKey = this.currentLoadKey();

    // O contexto do elemento é o do modelo V4 e sabe se recarregar; o tipo devolvido pela
    // view é o genérico, daí o cast.
    (this.getView().getBindingContext() as Context)?.refresh();

    [
      "loadTransactionsTable",
      "loadInvoicesTable",
      "loadMovementsTable",
      "loadRefusalReturnsTable",
      "loadDischargesTable",
      "loadTransshipmentsTable",
      "shipmentLoadCommentsTable",
      "shipmentLoadChangeLogsTable",
    ].forEach(id => {
      const binding = (this.byId(id) as Table)?.getBinding("rows") as ODataListBinding;
      binding?.refresh();
    });

    // `loadAttachmentsTable` NÃO entra na lista acima: o grid de anexos é JSONModel, e
    // `getBinding("rows").refresh()` sobre ele é no-op — não há requisição nenhuma por trás.
    // Só `refreshAttachments()` recarrega a lista de verdade.
    if (this.byId("loadAttachmentsTable")) {
      this.refreshAttachments(loadKey).catch(
        () => MessageBox.error("Erro ao atualizar a lista de anexos."));
    }

    // Mesmo motivo: desvincular romaneio (GAC-1181, Task 11) zera o papel do transbordo dele, e
    // a recusa com destino Transbordo abre uma linha nova — a situação/etapa derivadas no
    // cliente (`BaseController#refreshTransshipmentLinkage`) precisam dos dois lados frescos.
    this.refreshTransshipmentLinkage(loadKey).catch(
      () => MessageBox.error("Erro ao atualizar a situação dos transbordos."));
  }
}
