import Dialog from "sap/m/Dialog";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Button$PressEvent } from "sap/m/Button";
import { Link$PressEvent } from "sap/m/Link";
import Fragment from "sap/ui/core/Fragment";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Table from "sap/ui/table/Table";
import FileUploader from "sap/ui/unified/FileUploader";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { openAttachmentViewer } from "siagrob1/dialogs/AttachmentViewer";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import formatter from "siagrob1/model/formatter";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  buildDistributionLines,
  describeDistribution,
  distributeProportionally,
  DistributionInfo,
  DistributionLine,
  LoadInvoice,
  noEligibleLinesMessage,
  round3,
  summarizeDistribution
} from "siagrob1/helpers/DischargeDistributionHelpers";
import CommonController from "siagrob1/controller/common/CommonController";

/** Arquivo do anexo já em base64, no formato que as actions da carga esperam. */
type AttachmentPayload = { File: string; FileName: string; ContentType: string };

/**
 * Buffer JSON do diálogo de descarga (GAC-1171, rateio). `key` nulo significa inclusão; `lines` é o
 * grid de rateio e `info`, a faixa "Rateado X de Y".
 */
type DischargeForm = {
  title: string;
  key?: string;
  ticketNumber?: string;
  dischargeDate?: string;
  quantity?: number;
  comments?: string;
  lines: DistributionLine[];
  info: DistributionInfo;
};

/** Parcela gravada, como o `$expand=Items` do grid de tickets a entrega. */
type SavedDischargeItem = { SalesInvoiceItemKey: string; Quantity: number | string };

/** Linha do Select de Entrada em Armazenagem, no diálogo de transbordo (armazém próprio). */
type TransshipmentReceiptOption = { Key: string; Text: string };

/**
 * Buffer JSON do diálogo de transbordo (GAC-1181). Um único diálogo cobre os dois modos:
 * `mode: 'start'` é Iniciar Transbordo, `mode: 'entry'` é Registrar Entrada — `key` é sempre o
 * transbordo (nunca nulo em `entry`, sempre nulo em `start`, que ainda não existe).
 */
type TransshipmentDialogForm = {
  mode: "start" | "entry";
  title: string;
  key?: string;
  warehouseCode?: string;
  warehouseName?: string;
  /** yyyy-MM-dd — data do transbordo em `start`, data da entrada em `entry`. */
  date?: string;
  comments?: string;
  /** Resolvido ANTES de abrir o diálogo (WarehousesGetComplement), só vale em `entry`. */
  isOwn: boolean;
  grossWeight?: number;
  receiptKey?: string;
  receipts: TransshipmentReceiptOption[];
};

/**
 * Ponto de extensão da Montagem de Carga, no mesmo formato do `shipmentBilling`. Guarda as
 * descargas (GAC-1171) e os anexos, para não engordar mais o `Detail.controller`.
 */
export abstract class BaseController extends CommonController {

  private _dischargeDialog: Dialog;

  /** Trava ANTES do primeiro await: duplo clique gravaria o ticket duas vezes. */
  private _dischargeInFlight = false;

  private _transshipmentDialog: Dialog;

  /** Trava ANTES do primeiro await: duplo clique iniciaria/registraria o transbordo duas vezes. */
  private _transshipmentInFlight = false;

  /** Chave da carga aberta, lida do contexto do elemento da página. */
  protected currentLoadKey(): string {
    const context = this.getView().getBindingContext() as Context;
    return context?.getProperty("Key") as string;
  }

  /**
   * Lê o arquivo escolhido no FileUploader como base64, sem o prefixo `data:`.
   *
   * Resolve com `null` quando nada foi escolhido — registrar o ticket SEM anexo é o caminho
   * feliz. O `| null` não entra na assinatura porque o projeto compila com `strictNullChecks`
   * desligado, e o eslint recusa a união redundante.
   */
  protected loadAttachmentBase64(uploader?: FileUploader): Promise<AttachmentPayload> {
    // `oFileUpload` é o <input type="file"> que o FileUploader renderiza: não há getter público
    // para o arquivo escolhido quando o upload não passa pelo próprio controle.
    const input = (uploader as unknown as { oFileUpload?: HTMLInputElement })?.oFileUpload;
    const file = input?.files?.[0];

    if (!file) return Promise.resolve(null);

    return new Promise<AttachmentPayload>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // `readAsDataURL` sempre resolve com string; o tipo do FileReader é o genérico.
        const text = reader.result as string;
        resolve({
          File: text.includes(",") ? text.split(",")[1] : text,
          FileName: file.name,
          ContentType: file.type || "application/octet-stream",
        });
      };
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo selecionado."));
      reader.readAsDataURL(file);
    });
  }

  private dischargesTable(): Table {
    return this.byId("loadDischargesTable") as Table;
  }

  private dischargeFileUploader(): FileUploader {
    return this.byId("dischargeFileUploader") as FileUploader;
  }

  private viewModel(): JSONModel {
    return this.getModel("viewModel") as JSONModel;
  }

  /**
   * Hoje em `yyyy-MM-dd`, montado com os getters LOCAIS.
   *
   * ⚠️ Nunca `toISOString()`: ele devolve o dia em UTC, e das 21h em diante no horário de
   * Brasília o diálogo abriria com a data de amanhã.
   */
  private todayIso(): string {
    const today = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");

    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }

  /**
   * Documentos de saída da carga com as linhas, lidos ANTES de abrir o diálogo (GAC-1171, rateio).
   * O grid é um JSONModel estático: o que o usuário digita não pode virar PATCH pendente no update
   * group diferido da página.
   */
  private async loadLoadInvoicesAsync(): Promise<LoadInvoice[]> {
    const model = this.getModel() as ODataModel;

    const binding = model.bindList(
      `/ShipmentLoads(${this.currentLoadKey()})/Invoices`,
      undefined,
      undefined,
      undefined,
      {
        $select: "Key,InvoiceNumber,InvoiceType,InvoiceStatus",
        $expand: "Items($select=Key,ItemCode,ItemName,Quantity,ReturnedQuantity,TicketDeliveredQuantity;"
          + "$expand=SalesContract($select=Key,Code))",
      }
    );

    // A coleção inteira, e não a janela visível: a lista alimenta o grid do diálogo.
    const contexts = await binding.requestContexts(0, Infinity);

    return contexts.map(context => context.getObject() as LoadInvoice);
  }

  async onAddDischarge(): Promise<void> {
    if (!this.getView().getBindingContext()) {
      MessageBox.alert("Carga não carregada.");
      return;
    }

    this.setBusy(true);

    try {
      const invoices = await this.loadLoadInvoicesAsync();
      const lines = buildDistributionLines(invoices);

      if (lines.length === 0) {
        MessageBox.alert(noEligibleLinesMessage(invoices));
        return;
      }

      this.viewModel().setProperty("/dischargeDialog", {
        title: "Registrar Descarga",
        key: null,
        ticketNumber: "",
        // A action exige yyyy-MM-dd, que é o `valueFormat` do DatePicker.
        dischargeDate: this.todayIso(),
        quantity: null,
        comments: "",
        lines,
        info: describeDistribution(0, lines.map(line => line.share)),
      } as DischargeForm);

      await this.openDischargeDialog();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao preparar o registro de descarga.");
    } finally {
      this.setBusy(false);
    }
  }

  async onEditDischarge(): Promise<void> {
    const context = this.selectedDischargeContext();

    if (!context) return;

    this.setBusy(true);

    try {
      // O rateio gravado vem do `$expand=Items` do grid de tickets, já em cache.
      const saved = ((await context.requestObject("Items")) ?? []) as SavedDischargeItem[];
      // A tupla anotada é obrigatória: sem ela o TS infere (string | number)[] e o Map não compila.
      const ownShares = new Map<string, number>(
        saved.map((item): [string, number] => [item.SalesInvoiceItemKey, round3(item.Quantity)]));

      const invoices = await this.loadLoadInvoicesAsync();
      const lines = buildDistributionLines(invoices, ownShares);

      if (lines.length === 0) {
        MessageBox.alert(`${noEligibleLinesMessage(invoices)} Exclua o ticket se ele não vale mais.`);
        return;
      }

      // Edm.Decimal chega como STRING: `round3` converte antes do tipo Float do campo.
      const quantity = round3(context.getProperty("DischargedQuantity"));

      this.viewModel().setProperty("/dischargeDialog", {
        title: "Editar Descarga",
        key: context.getProperty("Key") as string,
        ticketNumber: context.getProperty("TicketNumber") as string,
        // A data chega com hora (datetime2); a action só aceita o dia.
        dischargeDate: ((context.getProperty("DischargeDate") as string) ?? "").slice(0, 10),
        quantity,
        comments: (context.getProperty("Comments") as string) ?? "",
        lines,
        info: describeDistribution(quantity, lines.map(line => line.share)),
      } as DischargeForm);

      await this.openDischargeDialog();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao abrir a descarga.");
    } finally {
      this.setBusy(false);
    }
  }

  /** Peso total digitado: rateia de novo, proporcional à Qtd. Líquida (sobrescreve o grid). */
  onDischargeQuantityChange(): void {
    this.redistributeDischarge();
  }

  /** Botão "Ratear proporcionalmente": refaz a sugestão depois de um ajuste à mão. */
  onRedistributeDischarge(): void {
    this.redistributeDischarge();
  }

  /** Uma parcela editada: só a faixa de fechamento muda. */
  onDischargeShareChange(): void {
    this.updateDischargeInfo();
  }

  private redistributeDischarge(): void {
    const viewModel = this.viewModel();
    const total = round3(viewModel.getProperty("/dischargeDialog/quantity"));
    const lines = (viewModel.getProperty("/dischargeDialog/lines") as DistributionLine[]) ?? [];
    const shares = distributeProportionally(total, lines.map(line => line.remainingQuantity));

    // Por caminho, e não reescrevendo o array: o JSONModel avisa só as células que mudaram.
    shares.forEach((share, index) =>
      viewModel.setProperty(`/dischargeDialog/lines/${index}/share`, share));

    this.updateDischargeInfo();
  }

  private updateDischargeInfo(): void {
    const viewModel = this.viewModel();
    const total = round3(viewModel.getProperty("/dischargeDialog/quantity"));
    const lines = (viewModel.getProperty("/dischargeDialog/lines") as DistributionLine[]) ?? [];

    viewModel.setProperty("/dischargeDialog/info", describeDistribution(total, lines.map(line => line.share)));
  }

  /**
   * O fragmento é carregado com o id da VIEW, e não com um id próprio: é assim que o
   * `this.byId("dischargeFileUploader")` alcança o campo de arquivo depois.
   */
  private async openDischargeDialog(): Promise<void> {
    if (!this._dischargeDialog) {
      this._dischargeDialog = await Fragment.load({
        id: this.getView().getId(),
        name: "siagrob1.view.shipmentLoads.fragments.ShipmentLoadDischargeDialog",
        controller: this,
      }) as Dialog;

      this.getView().addDependent(this._dischargeDialog);
    }

    // O FileUploader guarda o arquivo da abertura anterior: sem limpar, o ticket seguinte
    // subiria com o anexo do ticket passado.
    this.dischargeFileUploader()?.clear();

    this._dischargeDialog.open();
  }

  onCloseDischargeDialog(): void {
    this._dischargeDialog?.close();
  }

  async onConfirmDischarge(): Promise<void> {
    if (this._dischargeInFlight) return;

    const form = this.viewModel().getProperty("/dischargeDialog") as DischargeForm;

    const ticketNumber = (form.ticketNumber ?? "").trim();
    const dischargeDate = (form.dischargeDate ?? "").trim();
    const quantity = round3(form.quantity);

    if (ticketNumber === "") {
      MessageBox.alert("Informe o número do ticket.");
      return;
    }

    if (dischargeDate === "") {
      MessageBox.alert("Informe a data da descarga.");
      return;
    }

    if (!(quantity > 0)) {
      MessageBox.alert("Informe o peso descarregado.");
      return;
    }

    // Mesma normalização do servidor: 3 casas e sem as parcelas zero.
    const shares = (form.lines ?? [])
      .map(line => ({ key: line.salesInvoiceItemKey, share: round3(line.share) }))
      .filter(line => line.share > 0);

    if (shares.length === 0) {
      MessageBox.alert("Distribua o peso descarregado entre os documentos de saída.");
      return;
    }

    if (!summarizeDistribution(quantity, shares.map(line => line.share)).closed) {
      MessageBox.alert(
        `${describeDistribution(quantity, shares.map(line => line.share)).text} Ajuste o rateio antes de gravar.`);
      return;
    }

    this._dischargeInFlight = true;
    this._dischargeDialog?.setBusy(true);
    this.setBusy(true);

    try {
      const model = this.getModel() as ODataModel;

      if (form.key) {
        const action = model.bindContext("/ShipmentLoadsDischargeUpdate(...)");
        action.setParameter("Key", form.key);
        action.setParameter("TicketNumber", ticketNumber);
        action.setParameter("DischargeDate", dischargeDate);
        action.setParameter("Quantity", quantity);
        action.setParameter("Comments", form.comments ?? "");
        action.setParameter("SalesInvoiceItemKeys", shares.map(line => line.key));
        action.setParameter("Quantities", shares.map(line => line.share));
        await action.invoke();
        MessageToast.show("Descarga alterada.");
      } else {
        const file = await this.loadAttachmentBase64(this.dischargeFileUploader());

        const action = model.bindContext("/ShipmentLoadsDischargeCreate(...)");
        action.setParameter("LoadKey", this.currentLoadKey());
        action.setParameter("TicketNumber", ticketNumber);
        action.setParameter("DischargeDate", dischargeDate);
        action.setParameter("Quantity", quantity);
        action.setParameter("Comments", form.comments ?? "");
        action.setParameter("SalesInvoiceItemKeys", shares.map(line => line.key));
        action.setParameter("Quantities", shares.map(line => line.share));

        if (file) {
          action.setParameter("File", file.File);
          action.setParameter("FileName", file.FileName);
          action.setParameter("ContentType", file.ContentType);
        }

        await action.invoke();
        MessageToast.show("Descarga registrada.");
      }

      // O diálogo só fecha DEPOIS do resolve: fechar antes descartaria o que foi digitado se a
      // action recusasse o ticket.
      this.onCloseDischargeDialog();
      this.refreshDischarges();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao gravar a descarga.");
    } finally {
      this._dischargeInFlight = false;
      this._dischargeDialog?.setBusy(false);
      this.setBusy(false);
    }
  }

  async onRemoveDischarge(): Promise<void> {
    const context = this.selectedDischargeContext();

    if (!context) return;

    if (!await DialogHelper.confirmDialog("Excluir o registro de descarga selecionado ?")) return;

    this.setBusy(true);

    try {
      const action = (this.getModel() as ODataModel)
        .bindContext("/ShipmentLoadsDischargeDelete(...)");
      action.setParameter("Key", context.getProperty("Key") as string);
      await action.invoke();

      MessageToast.show("Descarga excluída.");
      this.refreshDischarges();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao excluir a descarga.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * O binário sai fora da leitura normal do OData, por uma rota própria: não existe
   * `EntitySet<ShipmentLoadAttachment>` no EDM, e a tela chega ao arquivo pela AttachmentKey
   * que o próprio ticket guarda.
   *
   * O clip do ticket abre o visualizador (GAC-1171, melhorias). O ticket só guarda a
   * AttachmentKey: o nome do arquivo vem do Content-Disposition, e o `$select` do grid não
   * precisa mudar.
   */
  async onViewDischargeAttachment(event: Button$PressEvent): Promise<void> {
    const key = event.getSource().getBindingContext()?.getProperty("AttachmentKey") as string;

    if (!key) return;

    await openAttachmentViewer({ url: `${ServerRoutes.shipmentLoadsAttachmentsDownload}(Key=${key})` });
  }

  private selectedDischargeContext(): Context | null {
    const table = this.dischargesTable();
    const index = table?.getSelectedIndex() ?? -1;

    if (index < 0) {
      MessageBox.alert("Selecione um registro de descarga.");
      return null;
    }

    return table.getContextByIndex(index) as Context;
  }

  /**
   * Recarrega a lista de tickets e o que anda junto com ela: o cabeçalho, porque
   * `ShipmentLoad.DischargedQuantity` é recalculado no servidor a cada escrita, e o log de
   * alterações, porque toda mutação de descarga grava linha nele.
   */
  protected refreshDischarges(): void {
    // ⚠️ Lida ANTES do `context.refresh()` logo abaixo: o `refresh()` invalida o cache da entidade
    // e, no mesmo tick, `getProperty("Key")` passa a devolver `undefined` até a nova resposta
    // chegar. `refreshAttachments()` chamado depois disso sem chave explícita mandava
    // `LoadKey=undefined` ao servidor (404 confirmado no navegador) — currentLoadKey() aqui, ANTES
    // do refresh, ainda lê o mesmo contexto já carregado que serviu de LoadKey/Key para a action
    // que acabou de gravar/excluir o ticket, logo acima na pilha de chamada.
    const loadKey = this.currentLoadKey();

    (this.getView().getBindingContext() as Context)?.refresh();

    ["loadDischargesTable", "shipmentLoadChangeLogsTable"].forEach(id => {
      const binding = (this.byId(id) as Table)?.getBinding("rows") as ODataListBinding;
      binding?.refresh();
    });

    // `loadAttachmentsTable` só existe depois da aba de anexos; o `?.` tolera o id ausente. O
    // grid de anexos NÃO é coleção OData — `.refresh()` sobre a binding do JSONModel acima seria
    // no-op, porque não há requisição nenhuma por trás dela. Sem chamar `refreshAttachments()` de
    // verdade, o anexo que sobe junto com o ticket só apareceria recarregando a página (F5).
    if (this.byId("loadAttachmentsTable")) {
      this.refreshAttachments(loadKey).catch(
        () => MessageBox.error("Erro ao atualizar a lista de anexos."));
    }
  }

  /* ------------------------------------------------------------------ */
  /* Anexos (GAC-1171)                                                   */
  /* ------------------------------------------------------------------ */

  private _attachmentDialog?: Dialog;

  /**
   * Carrega o grid de anexos pela Function `ShipmentLoadsAttachmentsList`. Chamar na rota casada
   * da página e depois de gravar/excluir um anexo.
   *
   * Aceita a chave explícita porque, no primeiro carregamento, `bindElement` é síncrono e não
   * espera a resposta: `currentLoadKey()` leria a Key do contexto OData ainda não resolvido e
   * mandaria `LoadKey=undefined` para o servidor. Nas chamadas depois de gravar/excluir a carga
   * já está aberta há tempo, então omitir o parâmetro e cair no contexto funciona normalmente.
   *
   * ⚠️ A Function é `Returns<IActionResult>()`, fora do pipeline OData que capitaliza por EDM:
   * o DTO já foi corrigido para sair em PascalCase com `AttachmentType` como string (backend
   * `9892e82`), mas a normalização abaixo tolera as duas caixas como defesa — sem custo e sem
   * conflito com o formato atual.
   *
   * Usa `sendJson`/`readErrorMessage` (o mesmo par da Conferência de Armazém) em vez de `fetch`
   * cru: uma falha aqui precisa aparecer para o usuário, não deixar a aba simplesmente vazia
   * como se não houvesse anexo nenhum.
   */
  protected async refreshAttachments(loadKey: string = this.currentLoadKey()): Promise<void> {
    const result = await sendJson(
      "GET", `${ServerRoutes.shipmentLoadsAttachmentsList}(LoadKey=${loadKey})`);

    if (!result.ok) {
      this.viewModel().setProperty("/attachments", []);
      MessageBox.error(result.message);
      return;
    }

    const data = result.data;
    const rows = (Array.isArray(data) ? data : ((data as { value?: unknown[] })?.value ?? [])) as Record<string, unknown>[];

    this.viewModel().setProperty("/attachments", rows.map(row => ({
      Key: row.Key ?? row.key,
      AttachmentType: row.AttachmentType ?? row.attachmentType,
      Description: row.Description ?? row.description,
      FileName: row.FileName ?? row.fileName,
      CreatedBy: row.CreatedBy ?? row.createdBy,
      CreatedAt: row.CreatedAt ?? row.createdAt,
    })));
  }

  async onAddAttachment(): Promise<void> {
    this.viewModel().setProperty("/attachmentDialog", {
      attachmentType: "DischargeTicket",
      description: "",
    });

    // `addDependent` DENTRO do if, como no diálogo de descarga: fora dele, cada abertura
    // re-inseria o mesmo controle na agregação de dependentes da view.
    if (!this._attachmentDialog) {
      this._attachmentDialog = await Fragment.load({
        id: this.getView().getId(),
        name: "siagrob1.view.shipmentLoads.fragments.ShipmentLoadAttachmentDialog",
        controller: this,
      }) as Dialog;

      this.getView().addDependent(this._attachmentDialog);
    }

    // O fragmento é carregado uma única vez, então o <input type="file"> guarda o arquivo da
    // abertura anterior. Sem limpar, o segundo anexo sobe com o arquivo do primeiro — e em
    // silêncio, porque `loadAttachmentBase64` encontra o arquivo velho e o alerta "Selecione o
    // arquivo." nunca dispara. Mesmo motivo do `clear()` do diálogo de descarga.
    (this.byId("attachmentFileUploader") as FileUploader)?.clear();

    this._attachmentDialog.open();
  }

  onCloseAttachmentDialog(): void {
    this._attachmentDialog?.close();
  }

  async onConfirmAttachment(): Promise<void> {
    const form = this.viewModel().getProperty("/attachmentDialog") as {
      attachmentType?: string;
      description?: string;
    };

    const description = (form.description ?? "").trim();

    if (description === "") {
      MessageBox.alert("Informe a descrição do anexo.");
      return;
    }

    const file = await this.loadAttachmentBase64(
      this.byId("attachmentFileUploader") as FileUploader);

    if (!file) {
      MessageBox.alert("Selecione o arquivo.");
      return;
    }

    this.setBusy(true);

    try {
      const action = (this.getModel() as ODataModel)
        .bindContext("/ShipmentLoadsAttachmentUpload(...)");
      action.setParameter("LoadKey", this.currentLoadKey());
      action.setParameter("AttachmentType", form.attachmentType ?? "Other");
      action.setParameter("Description", description);
      action.setParameter("File", file.File);
      action.setParameter("FileName", file.FileName);
      action.setParameter("ContentType", file.ContentType);
      await action.invoke();

      MessageToast.show("Documento anexado.");
      this.onCloseAttachmentDialog();
      await this.refreshAttachments();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao anexar o documento.");
    } finally {
      this.setBusy(false);
    }
  }

  onDownloadAttachment(): void {
    const row = this.selectedAttachmentRow();

    if (!row) return;

    window.open(`${ServerRoutes.shipmentLoadsAttachmentsDownload}(Key=${row.Key})`, "_blank");
  }

  /** GAC-1171 (melhorias): visualiza o anexo selecionado, sem baixar. */
  async onViewAttachment(): Promise<void> {
    const row = this.selectedAttachmentRow();

    if (!row) return;

    await this.viewShipmentLoadAttachment(row.Key, row.FileName);
  }

  /** O Link da coluna Arquivo: usa o contexto da PRÓPRIA linha, não a seleção. */
  async onViewAttachmentFromRow(event: Link$PressEvent): Promise<void> {
    // Sem `| undefined` no cast: com strictNullChecks desligado o lint o acusa como redundante. O
    // `?.` abaixo cobre a linha sem contexto do mesmo jeito.
    const row = event.getSource().getBindingContext("viewModel")?.getObject() as
      { Key: string; FileName?: string };

    if (!row?.Key) return;

    await this.viewShipmentLoadAttachment(row.Key, row.FileName);
  }

  private viewShipmentLoadAttachment(key: string, fileName?: string): Promise<void> {
    return openAttachmentViewer({
      url: `${ServerRoutes.shipmentLoadsAttachmentsDownload}(Key=${key})`,
      fileName,
    });
  }

  async onRemoveAttachment(): Promise<void> {
    const row = this.selectedAttachmentRow();

    if (!row) return;

    if (!await DialogHelper.confirmDialog("Excluir o anexo selecionado ?")) return;

    this.setBusy(true);

    try {
      const action = (this.getModel() as ODataModel)
        .bindContext("/ShipmentLoadsAttachmentDelete(...)");
      action.setParameter("Key", row.Key);
      await action.invoke();

      MessageToast.show("Anexo excluído.");
      await this.refreshAttachments();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao excluir o anexo.");
    } finally {
      this.setBusy(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private selectedAttachmentRow(): { Key: string; FileName?: string } | null {
    const table = this.byId("loadAttachmentsTable") as Table;
    const index = table?.getSelectedIndex?.() ?? -1;

    if (index < 0) {
      MessageBox.alert("Selecione um anexo.");
      return null;
    }

    return table.getContextByIndex(index)?.getObject() as { Key: string; FileName?: string };
  }

  /* ------------------------------------------------------------------ */
  /* Transbordos (GAC-1181)                                              */
  /* ------------------------------------------------------------------ */

  private transshipmentsTable(): Table {
    return this.byId("loadTransshipmentsTable") as Table;
  }

  private selectedTransshipmentContext(): Context | null {
    const table = this.transshipmentsTable();
    const index = table?.getSelectedIndex() ?? -1;

    if (index < 0) {
      MessageBox.alert("Selecione um transbordo.");
      return null;
    }

    return table.getContextByIndex(index) as Context;
  }

  async onStartTransshipment(): Promise<void> {
    if (!this.getView().getBindingContext()) {
      MessageBox.alert("Carga não carregada.");
      return;
    }

    this.viewModel().setProperty("/transshipmentDialog", {
      mode: "start",
      title: "Iniciar Transbordo",
      key: null,
      warehouseCode: "",
      warehouseName: "",
      date: this.todayIso(),
      comments: "",
      isOwn: false,
      grossWeight: null,
      receiptKey: null,
      receipts: [],
    } as TransshipmentDialogForm);

    await this.openTransshipmentDialog();
  }

  /**
   * Value help do armazém do transbordo, escrito à mão no buffer do diálogo — não o
   * `openWarehouseValueHelp` genérico, pelo mesmo motivo de
   * `Detail.controller#openRefusalWarehouseValueHelp`: esta view tem element binding OData
   * (`/ShipmentLoads(...)`), e aquele helper tentaria gravar a descrição na entidade da carga.
   */
  async openTransshipmentWarehouseValueHelp(): Promise<void> {
    const selected = await DialogHelper.openTableSelectDialog(
      this, "WarehousesSelectDialog", ["Code", "Name", "TaxId", "FName"], []);

    if (!selected) return;

    const viewModel = this.viewModel();
    viewModel.setProperty(
      "/transshipmentDialog/warehouseCode", selected.getProperty("Code") as string);
    viewModel.setProperty(
      "/transshipmentDialog/warehouseName", selected.getProperty("Name") as string);
  }

  /**
   * Descobre se o armazém é PRÓPRIO (WarehousesGetComplement, mesmo caminho de
   * `armazem/Complement.controller`). Armazém sem registro de complemento equivale a NÃO —
   * mesma leitura de `ShipmentLoadsTransshipmentRegisterEntryService` no servidor.
   */
  private async isOwnWarehouseAsync(warehouseCode: string): Promise<boolean> {
    const func = (this.getModel() as ODataModel).bindContext(this.api.warehousesGetComplement);
    func.setParameter("WarehouseCode", warehouseCode);
    await func.invoke();

    const complement = func.getBoundContext().getObject() as { IsOwn?: boolean };
    return complement?.IsOwn === true;
  }

  /**
   * Romaneios de Entrada em Armazenagem elegíveis para vincular à entrada do transbordo, no
   * armazém PRÓPRIO informado — as mesmas condições de
   * `ShipmentLoadTransshipmentRules.EnsureOwnWarehouseReceiptIsUsable`, aplicadas aqui para o
   * Select nunca oferecer um romaneio que a action recusaria depois. Isso inclui o lote ser de
   * natureza Transbordo (`StorageAddress/Nature eq 'Transshipment'`) — sem essa condição, o
   * Select oferecia Entradas de lote COMUM que `EnsureReceiptIsFromTransshipmentLotAsync`
   * recusa depois no servidor.
   *
   * Filtro por navigation property (`StorageAddress/Nature`), NÃO em dois passos: verificado
   * contra o backend rodando que o OData aceita `$filter` atravessando a navigation property
   * (join implícito) — `$select` com o mesmo caminho pontilhado é que o OData rejeita com 400
   * ("Found a path with multiple navigation properties..."), por isso o lote vem via `$expand`
   * abaixo, não via `$select`.
   *
   * Filtro de ENUM como string crua no `$filter`, nunca `new Filter(...)`: o UI5 não sabe
   * formatar o literal de um enum a partir do metadata e estoura "Unsupported type".
   */
  private async loadEligibleTransshipmentReceiptsAsync(
    warehouseCode: string
  ): Promise<TransshipmentReceiptOption[]> {
    const load = this.getView().getBindingContext() as Context;

    // requestProperty, NUNCA getProperty: com autoExpandSelect, o $select do bindElement da
    // página é montado a partir dos bindings de CONTROLE existentes na view, e nenhum deles
    // exibe ItemCode/BranchCode/UnitOfMeasureCode como escalar (a filial só aparece via
    // {Branch/ShortName}, que expande a navegação, não o escalar). getProperty devolveria
    // undefined em silêncio, e o filtro casaria a string "undefined" com nada — falha muda,
    // com cara de regra de negócio (o diálogo diria sempre "não há Entrada em Armazenagem").
    const [itemCode, branchCode, unitOfMeasureCode] = await Promise.all([
      load.requestProperty("ItemCode") as Promise<string>,
      load.requestProperty("BranchCode") as Promise<string>,
      load.requestProperty("UnitOfMeasureCode") as Promise<string>,
    ]);

    // Escapa aspas simples no literal do $filter — mesma convenção de
    // Attach.controller#applyShipmentFilters e Panel.controller (`.replace(/'/g, "''")`).
    const escape = (value: string) => (value ?? "").replace(/'/g, "''");

    const filter = [
      "TransactionType eq 'Receipt'",
      "TransactionStatus eq 'Confirmed'",
      `WarehouseCode eq '${escape(warehouseCode)}'`,
      `ItemCode eq '${escape(itemCode)}'`,
      `BranchCode eq '${escape(branchCode)}'`,
      `UnitOfMeasureCode eq '${escape(unitOfMeasureCode)}'`,
      "ShipmentLoadKey eq null",
      "ShipmentLoadTransshipmentKey eq null",
      "StorageAddress/Nature eq 'Transshipment'",
    ].join(" and ");

    const binding = (this.getModel() as ODataModel).bindList(
      "/StorageTransactions",
      undefined,
      undefined,
      undefined,
      {
        $filter: filter,
        $select: "Key,Code,GrossWeight,TransactionDate",
        // Lote via $expand, não $select: um $select com caminho pontilhado por navigation
        // property ("StorageAddress/Code") estoura 400 no OData — só $expand com $select
        // ANINHADO é aceito.
        $expand: "StorageAddress($select=Code,Description)",
        $orderby: "TransactionDate desc",
      }
    );

    const contexts = await binding.requestContexts(0, Infinity);

    return contexts.map(context => {
      const row = context.getObject() as {
        Key: string; Code?: string; GrossWeight?: number | string; TransactionDate?: string;
        StorageAddress?: { Code?: string; Description?: string };
      };
      // Edm.Decimal chega como STRING — mesmo cuidado de onEditDischarge.
      const weight = formatter.formatDecimal(Number(row.GrossWeight ?? 0), 3);
      // Mostra o lote na linha: com o filtro só oferecendo lotes de Transbordo, ainda pode
      // haver mais de um no mesmo armazém, e o operador precisa CONFERIR qual escolheu, não só
      // confiar que o sistema filtrou certo.
      const lotCode = row.StorageAddress?.Code ?? "";
      const lotDescription = row.StorageAddress?.Description ?? "";
      const lot = lotDescription ? `${lotCode} - ${lotDescription}` : lotCode;

      return {
        Key: row.Key,
        Text:
          `${row.Code ?? ""} - ${formatter.formatDate(row.TransactionDate)} - ${weight}` +
          ` - Lote ${lot}`,
      };
    });
  }

  async onRegisterTransshipmentEntry(): Promise<void> {
    const context = this.selectedTransshipmentContext();

    if (!context) return;

    if (context.getProperty("EntryStorageTransactionKey")) {
      MessageBox.alert(
        "A entrada deste transbordo já foi registrada. Estorne-o para corrigir.");
      return;
    }

    const key = context.getProperty("Key") as string;
    const warehouseCode = context.getProperty("WarehouseCode") as string;
    const warehouseName = context.getProperty("WarehouseName") as string;

    this.setBusy(true);

    try {
      const isOwn = await this.isOwnWarehouseAsync(warehouseCode);
      let receipts: TransshipmentReceiptOption[] = [];

      if (isOwn) {
        receipts = await this.loadEligibleTransshipmentReceiptsAsync(warehouseCode);

        if (receipts.length === 0) {
          // A mensagem precisa citar o LOTE DE TRANSBORDO: desde a fase 2 do GAC-1181 a entrada
          // só aceita romaneio pesado num lote de natureza Transbordo, e sem isso o operador
          // lança a entrada num lote comum e volta a esbarrar na mesma parede.
          MessageBox.alert(
            "Não há Entrada em Armazenagem confirmada, sem vínculo, pesada num lote de " +
            "TRANSBORDO do armazém, produto, filial e unidade desta carga. Pese a entrada " +
            "num lote de natureza Transbordo antes de registrar o transbordo — se ele ainda " +
            "não existe, cadastre-o em Armazenagem > Lotes de Armazenagem.");
          return;
        }
      }

      this.viewModel().setProperty("/transshipmentDialog", {
        mode: "entry",
        title: "Registrar Entrada do Transbordo",
        key,
        warehouseCode,
        warehouseName,
        date: this.todayIso(),
        comments: "",
        isOwn,
        grossWeight: null,
        receiptKey: null,
        receipts,
      } as TransshipmentDialogForm);

      await this.openTransshipmentDialog();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao preparar o registro de entrada.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * O fragmento é carregado com o id da VIEW, como o diálogo de descarga: `addDependent` DENTRO
   * do `if`, senão cada abertura re-insere o mesmo controle na agregação de dependentes.
   */
  private async openTransshipmentDialog(): Promise<void> {
    if (!this._transshipmentDialog) {
      this._transshipmentDialog = await Fragment.load({
        id: this.getView().getId(),
        name: "siagrob1.view.shipmentLoads.fragments.ShipmentLoadTransshipmentDialog",
        controller: this,
      }) as Dialog;

      this.getView().addDependent(this._transshipmentDialog);
    }

    this._transshipmentDialog.open();
  }

  onCloseTransshipmentDialog(): void {
    this._transshipmentDialog?.close();
  }

  async onConfirmTransshipmentDialog(): Promise<void> {
    // Trava ANTES do primeiro await: duplo clique dispararia duas actions.
    if (this._transshipmentInFlight) return;

    const form = this.viewModel().getProperty("/transshipmentDialog") as TransshipmentDialogForm;
    const date = (form.date ?? "").trim();

    if (date === "") {
      MessageBox.alert(
        form.mode === "start" ? "Informe a data do transbordo." : "Informe a data da entrada.");
      return;
    }

    if (form.mode === "start") {
      if (!(form.warehouseCode ?? "").trim()) {
        MessageBox.alert("Informe o armazém do transbordo.");
        return;
      }
    } else if (form.isOwn) {
      if (!form.receiptKey) {
        MessageBox.alert("Selecione o romaneio de Entrada em Armazenagem.");
        return;
      }
    } else if (!(Number(form.grossWeight ?? 0) > 0)) {
      MessageBox.alert("Informe o peso pesado na entrada do transbordo.");
      return;
    }

    this._transshipmentInFlight = true;
    this._transshipmentDialog?.setBusy(true);
    this.setBusy(true);

    try {
      const model = this.getModel() as ODataModel;

      if (form.mode === "start") {
        const action = model.bindContext("/ShipmentLoadsTransshipmentStart(...)");
        action.setParameter("LoadKey", this.currentLoadKey());
        action.setParameter("WarehouseCode", form.warehouseCode.trim());
        action.setParameter("TransshipmentDate", date);
        action.setParameter("Comments", (form.comments ?? "").trim());
        await action.invoke();
        MessageToast.show("Transbordo iniciado.");
      } else {
        const action = model.bindContext("/ShipmentLoadsTransshipmentRegisterEntry(...)");
        action.setParameter("Key", form.key);
        action.setParameter("EntryDate", date);

        // Só um dos dois: GrossWeight (terceiro) ou ReceiptStorageTransactionKey (próprio), como
        // o backend decide pelo IsOwn do complemento — nunca os dois, nunca nenhum.
        if (form.isOwn) {
          action.setParameter("ReceiptStorageTransactionKey", form.receiptKey);
        } else {
          action.setParameter("GrossWeight", Number(form.grossWeight));
        }

        await action.invoke();
        MessageToast.show("Entrada do transbordo registrada.");
      }

      // O diálogo só fecha DEPOIS do resolve: fechar antes descartaria o que foi digitado se a
      // action recusasse o transbordo.
      this.onCloseTransshipmentDialog();
      this.refreshTransshipments();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao gravar o transbordo.");
    } finally {
      this._transshipmentInFlight = false;
      this._transshipmentDialog?.setBusy(false);
      this.setBusy(false);
    }
  }

  async onReverseTransshipment(): Promise<void> {
    const context = this.selectedTransshipmentContext();

    if (!context) return;

    if (!await DialogHelper.confirmDialog("Estornar o transbordo selecionado ?")) return;

    this.setBusy(true);

    try {
      const action = (this.getModel() as ODataModel)
        .bindContext("/ShipmentLoadsTransshipmentReverse(...)");
      action.setParameter("Key", context.getProperty("Key") as string);
      await action.invoke();

      MessageToast.show("Transbordo estornado.");
      this.refreshTransshipments();
    } catch (e) {
      MessageBox.error((e as Error).message || "Erro ao estornar o transbordo.");
    } finally {
      this.setBusy(false);
    }
  }

  /**
   * Recarrega a lista de transbordos e o que anda junto dela: o cabeçalho, porque
   * `ShipmentLoad.Status`/`TransshippedQuantity`/`AvailableQuantity` são recalculados no
   * servidor a cada escrita, e a Movimentação, porque toda action do módulo grava linha nela
   * (`TransshipmentStarted`/`TransshipmentEntered`/`TransshipmentReversed`) — diferente das
   * Descargas, que gravam no Log de Alterações.
   */
  protected refreshTransshipments(): void {
    (this.getView().getBindingContext() as Context)?.refresh();

    ["loadTransshipmentsTable", "loadMovementsTable"].forEach(id => {
      const binding = (this.byId(id) as Table)?.getBinding("rows") as ODataListBinding;
      binding?.refresh();
    });

    this.refreshTransshipmentLinkage().catch(
      () => MessageBox.error("Erro ao atualizar a situação dos transbordos."));
  }

  /**
   * Estado derivado no CLIENTE (GAC-1181, Task 11): o backend ainda não expõe, num único campo,
   * se a Expedição de venda de um transbordo já foi vinculada — esse vínculo por papel é a
   * própria Task 11 (`ShipmentLoadsAttachTransactions` com `TransshipmentKey`). A saída do LOTE
   * (fase 2, Task 10) já é direta — `ShipmentLoadTransshipment.LotExitStorageTransactionKey` —
   * e não precisa deste cruzamento. Por isso o cliente cruza as duas coleções da carga a cada
   * mudança relevante:
   * - `linkedKeys`: as chaves de transbordo cuja Expedição de venda (`SalesShipment`, o 7) já foi
   *   vinculada — fecha o último estado ("Concluído") de `formatter.formatTransshipmentStatus`.
   *   `Transactions` traz, pelo MESMO `ShipmentLoadTransshipmentKey`, também a entrada
   *   (`Receipt`/`TransshipmentReceipt`) e, desde a fase 2, a saída do lote (`Shipment`) — nenhum
   *   dos dois conclui o transbordo, por isso o `$filter` da consulta abaixo restringe a
   *   `TransactionType eq 'SalesShipment'`, o mesmo critério de
   *   `ShipmentLoadsRecalculateTransshippedService.HasOpenTransshipmentAsync` no servidor. Sem
   *   esse filtro, `linkedKeys` fica verdadeiro assim que a entrada é registrada (passo 3) e os
   *   estados "Aguardando saída"/"Aguardando expedição" nunca aparecem.
   * - `lookup`: chave do transbordo → texto pronto ("Transbordo N — armazém (X) Nome"), para a
   *   coluna "Etapa" do grid de romaneios (`formatter.formatShipmentLoadTransactionStage`).
   *
   * Grava em `viewModel` (Component model, global ao app) em vez de num model próprio da view:
   * é o mesmo lugar onde os diálogos deste módulo já guardam buffer, e as duas colunas que leem
   * este estado vivem em fragments diferentes (`ShipmentLoadTransshipments` e a seção Romaneios
   * do `Detail.view.xml`), sem um ancestral comum mais próximo.
   *
   * Duas consultas independentes, e não o binding visível das tabelas: `$$ownRequest` mantém o
   * ciclo de vida da UI, e ler o binding de uma tabela que pode nem estar renderizada ainda
   * (`byId` cedo demais) devolveria `undefined` em silêncio — o mesmo cuidado do resto do módulo.
   */
  protected async refreshTransshipmentLinkage(
    loadKey: string = this.currentLoadKey()
  ): Promise<void> {
    if (!loadKey) return;

    const model = this.getModel() as ODataModel;

    const transshipmentsBinding = model.bindList(
      `/ShipmentLoads(${loadKey})/Transshipments`,
      undefined,
      undefined,
      undefined,
      { $select: "Key,Sequence,WarehouseCode,WarehouseName" }
    );

    const transactionsBinding = model.bindList(
      `/ShipmentLoads(${loadKey})/Transactions`,
      undefined,
      undefined,
      undefined,
      {
        $select: "ShipmentLoadTransshipmentKey",
        // Espelha exatamente o critério de conclusão do servidor
        // (`ShipmentLoadsRecalculateTransshippedService.HasOpenTransshipmentAsync`): só o
        // `SalesShipment (7)` fecha o transbordo. `QueryTransactions` traz também, pelo MESMO
        // `ShipmentLoadTransshipmentKey`, a entrada (`Receipt`/`TransshipmentReceipt`) e, desde a
        // fase 2, a saída do lote (`Shipment`) — sem este filtro de tipo, `linkedKeys` fica
        // verdadeiro assim que a entrada é registrada, e "Aguardando saída"/"Aguardando
        // expedição" nunca aparecem.
        $filter: "ShipmentLoadTransshipmentKey ne null and TransactionType eq 'SalesShipment' " +
          "and TransactionStatus ne 'Cancelled'",
      }
    );

    const [transshipmentContexts, transactionContexts] = await Promise.all([
      transshipmentsBinding.requestContexts(0, Infinity),
      transactionsBinding.requestContexts(0, Infinity),
    ]);

    const lookup: Record<string, string> = {};

    transshipmentContexts.forEach(context => {
      const row = context.getObject() as {
        Key: string; Sequence?: number; WarehouseCode?: string; WarehouseName?: string;
      };
      lookup[row.Key] = formatter.formatTransshipmentLabel(row);
    });

    const linkedKeys = transactionContexts.map(
      context => context.getProperty("ShipmentLoadTransshipmentKey") as string);

    this.viewModel().setProperty("/transshipmentLinkage", { lookup, linkedKeys });
  }
}
