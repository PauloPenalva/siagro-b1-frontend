import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import MessageBox from "sap/m/MessageBox";
import { Input$ValueHelpRequestEvent } from "sap/m/Input";
import CommonController from "../common/CommonController";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import {
  normalizeBalancePreview,
  normalizeReleaseLines,
  WarehouseReconciliationBalancePreview,
  WarehouseReconciliationReleaseBalance,
} from "siagrob1/types/WarehouseReconciliationBalancePreview";
import Dialog from "sap/m/Dialog";
import MessageToast from "sap/m/MessageToast";
import Fragment from "sap/ui/core/Fragment";
import FileUploader, { FileUploader$ChangeEvent } from "sap/ui/unified/FileUploader";
import Table from "sap/ui/table/Table";
import DialogHelper from "siagrob1/dialogs/DialogHelper";

/**
 * Base das telas da Conferência de Saldo de Armazém (GAC-1164).
 *
 * O saldo do sistema e a diferença mostrados no formulário são PRÉVIA: o servidor recalcula e
 * congela os dois no envio e na aprovação. O que vale para a decisão é o snapshot gravado.
 *
 * @namespace siagrob1.controller.warehouseReconciliations
 */
export abstract class BaseController extends CommonController {

  /** Só a inclusão avisa sobre conferência em aberto: na edição, a aberta é a própria. */
  protected warnIfOpen = false;

  protected initReconciliationModel(): JSONModel {
    const model = new JSONModel({
      preview: { systemBalance: null, difference: null, lastApprovedReferenceDate: null, hasOpenReconciliation: false },
      dialog: { title: "", confirmText: "", action: "", text: "", textLabel: "", textRequired: false },
      attachment: { description: "" },
      attachmentsReadonly: false,
      distribution: [],
      distributionInfo: { loss: 0, distributed: 0, closed: true, isGain: false },
      savedLines: [],
    });
    this.getView().setModel(model, "wr");
    return model;
  }

  protected wr(): JSONModel {
    return this.getModel("wr") as JSONModel;
  }

  protected resetPreview(): void {
    this.wr().setProperty("/preview", {
      systemBalance: null, difference: null, lastApprovedReferenceDate: null, hasOpenReconciliation: false,
    });
    this.wr().setProperty("/distribution", []);
    this.updateDistributionInfo();
  }

  /**
   * Meio-dia com o fuso local: evita que a conversão de fuso no servidor jogue a data para o dia
   * anterior (00:00 em -03:00 é 21:00 da véspera em UTC).
   */
  protected todayAtNoonIso(): string {
    const d = new Date();
    const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? "+" : "-";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00:00` +
      `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
  }

  /** `yyyy-MM-dd` da data de referência do contexto. */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected referenceDateOf(ctx: Context): string | null {
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    const raw = ctx?.getProperty("ReferenceDate") as string | Date | null;
    if (!raw) return null;
    if (raw instanceof Date) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
    }
    // DateTimeOffset serializado com o fuso do servidor: os 10 primeiros caracteres são a data.
    return String(raw).substring(0, 10);
  }

  protected updateDifference(ctx: Context): void {
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    const system = this.wr().getProperty("/preview/systemBalance") as number | null;
    const reported = Number(ctx?.getProperty("ReportedBalance") ?? 0);
    this.wr().setProperty(
      "/preview/difference",
      system === null ? null : Math.round((reported - system) * 1000) / 1000
    );
    this.updateDistributionInfo();
  }

  /** Tolerância de arredondamento igual à do backend (0,001). */
  private static readonly TOLERANCE = 0.001;

  /**
   * Monta a grade de distribuição a partir das liberações da prévia, preservando o que o usuário já
   * digitou (ou o que estava gravado, na edição) para a mesma liberação. Com UMA liberação elegível
   * a perda inteira vai para ela sozinha (spec §9.4).
   */
  protected applyDistributionRows(releases: WarehouseReconciliationReleaseBalance[]): void {
    const typed = new Map<string, number>();
    ((this.wr().getProperty("/savedLines") ?? []) as { shipmentReleaseKey: string; quantity: number }[])
      .forEach((l) => typed.set(l.shipmentReleaseKey, l.quantity));
    ((this.wr().getProperty("/distribution") ?? []) as { shipmentReleaseKey: string; quantity: number }[])
      .forEach((l) => typed.set(l.shipmentReleaseKey, l.quantity));

    const rows = releases.map((r) => ({
      ...r,
      quantity: r.canReceiveLoss ? (typed.get(r.shipmentReleaseKey) ?? 0) : 0,
    }));

    this.wr().setProperty("/distribution", rows);
    this.autoFillSingleRelease();
    this.updateDistributionInfo();
  }

  private lossOf(): number {
    const difference = this.wr().getProperty("/preview/difference") as number;
    return difference !== null && difference < 0 ? Math.round(-difference * 1000) / 1000 : 0;
  }

  private autoFillSingleRelease(): void {
    const rows = (this.wr().getProperty("/distribution") ?? []) as { canReceiveLoss: boolean; quantity: number }[];
    const eligible = rows.filter((r) => r.canReceiveLoss);
    if (eligible.length === 1 && this.lossOf() > 0) {
      eligible[0].quantity = this.lossOf();
      this.wr().refresh(true);
    }
  }

  protected updateDistributionInfo(): void {
    const rows = (this.wr().getProperty("/distribution") ?? []) as { quantity: number }[];
    const distributed = Math.round(rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0) * 1000) / 1000;
    const loss = this.lossOf();
    const difference = this.wr().getProperty("/preview/difference") as number;

    this.wr().setProperty("/distributionInfo", {
      loss,
      distributed,
      closed: Math.abs(distributed - loss) <= BaseController.TOLERANCE,
      isGain: difference !== null && difference > 0,
    });
  }

  /**
   * Mesmo cálculo de `updateDistributionInfo`, mas a partir da distribuição JÁ GRAVADA
   * (`/savedLines`), não da grade digitável (`/distribution`). O Detail em rascunho não mostra a
   * grade — mostra os romaneios já gerados —, então é essa soma que precisa fechar com a perda
   * para liberar o envio para aprovação (§9.9).
   */
  protected updateSavedDistributionInfo(): void {
    const rows = (this.wr().getProperty("/savedLines") ?? []) as { quantity: number }[];
    const distributed = Math.round(rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0) * 1000) / 1000;
    const loss = this.lossOf();
    const difference = this.wr().getProperty("/preview/difference") as number;

    this.wr().setProperty("/distributionInfo", {
      loss,
      distributed,
      closed: Math.abs(distributed - loss) <= BaseController.TOLERANCE,
      isGain: difference !== null && difference > 0,
    });
  }

  onDistributionQuantityChange(): void {
    this.updateDistributionInfo();
  }

  /**
   * Grava a distribuição digitada. A conferência precisa já existir (Key).
   *
   * Diferença positiva (Sobra) não distribui nada — envia as duas listas vazias, o que limpa
   * qualquer distribuição gravada antes de o usuário corrigir o saldo informado para uma perda.
   */
  protected async saveDistribution(key: string): Promise<boolean> {
    const isGain = this.wr().getProperty("/distributionInfo/isGain") as boolean;

    const rows: { shipmentReleaseKey: string; quantity: number }[] = isGain
      ? []
      : ((this.wr().getProperty("/distribution") ?? []) as { shipmentReleaseKey: string; quantity: number }[])
          // Arredonda para a mesma tolerância do backend (0,001) antes de filtrar e enviar: sem
          // isto, um resto de ponto flutuante (0.0004999...) tanto escapava do filtro `> 0`
          // quanto chegava ao servidor com mais casas do que o DECIMAL(18,3) da coluna.
          .map((r) => ({ ...r, quantity: Math.round(Number(r.quantity) * 1000) / 1000 }))
          .filter((r) => r.quantity > 0);

    const result = await sendJson("POST", this.api.warehouseReconciliationsDistributeLoss, {
      Key: key,
      ShipmentReleaseKeys: rows.map((r) => r.shipmentReleaseKey),
      Quantities: rows.map((r) => r.quantity),
    });

    if (!result.ok) {
      MessageBox.error(result.message);
      return false;
    }
    return true;
  }

  protected async loadSavedLines(key: string): Promise<void> {
    this.wr().setProperty("/savedLines", []);
    const result = await sendJson("GET", `${this.api.warehouseReconciliationsListReleases}(Key=${key})`);
    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }
    this.wr().setProperty("/savedLines", normalizeReleaseLines(result.data));
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected async refreshPreview(ctx: Context): Promise<WarehouseReconciliationBalancePreview | null> {
    const warehouseCode = ctx?.getProperty("WarehouseCode") as string;
    const itemCode = ctx?.getProperty("ItemCode") as string;
    const referenceDate = this.referenceDateOf(ctx);

    if (!warehouseCode || !itemCode || !referenceDate) {
      this.resetPreview();
      return null;
    }

    const literal = (v: string) => encodeURIComponent(v.replace(/'/g, "''"));
    const url = `${this.api.warehouseReconciliationsGetBalancePreview}` +
      `(WarehouseCode='${literal(warehouseCode)}',ItemCode='${literal(itemCode)}',ReferenceDate='${referenceDate}')`;

    const result = await sendJson("GET", url);
    if (!result.ok) {
      // Sem isto, uma grade/linhas gravadas do armazém+produto anterior ficavam na tela junto
      // com a mensagem de erro, como se ainda valessem para o novo contexto.
      this.resetPreview();
      MessageBox.error(result.message);
      return null;
    }

    // O contexto pode ter mudado de armazém/produto/data (ou de registro, numa navegação) enquanto
    // este GET estava em voo. Uma resposta que chegue depois de outra requisição mais nova não pode
    // sobrescrever a prévia — ela não corresponde mais ao que está na tela.
    if (
      ctx?.getProperty("WarehouseCode") !== warehouseCode ||
      ctx?.getProperty("ItemCode") !== itemCode ||
      this.referenceDateOf(ctx) !== referenceDate
    ) {
      return null;
    }

    const preview = normalizeBalancePreview(result.data);
    this.wr().setProperty("/preview/systemBalance", preview.systemBalance);
    this.wr().setProperty("/preview/lastApprovedReferenceDate", preview.lastApprovedReferenceDate);
    this.wr().setProperty("/preview/hasOpenReconciliation", preview.hasOpenReconciliation);
    // A diferença precisa estar atualizada ANTES de montar a grade: com uma única liberação
    // elegível, `applyDistributionRows` preenche a linha sozinha com base na perda (`lossOf()`),
    // que deriva da diferença — calculá-la depois usaria a diferença do registro/prévia anterior.
    this.updateDifference(ctx);
    this.applyDistributionRows(preview.releases);
    return preview;
  }

  /** Reavalia a prévia e as travas que o servidor aplicará, para o usuário errar cedo. */
  protected async afterKeyFieldsChanged(): Promise<void> {
    const ctx = this.getView().getBindingContext() as Context;
    const preview = await this.refreshPreview(ctx);
    if (!preview) return;

    if (preview.isOwnWarehouse) {
      MessageBox.warning("A conferência de saldo só pode ser feita para armazém de terceiros.");
      // `WarehouseCode` está no grupo de update padrão: `setProperty` nele só resolve no
      // submitBatch, então não pode ser aguardado aqui. `WarehouseName` é campo de exibição
      // (grupo `null`) e resolve na hora.
      await ctx.setProperty("WarehouseName", null, null);
      void ctx.setProperty("WarehouseCode", "");
      this.resetPreview();
      return;
    }

    if (this.warnIfOpen && preview.hasOpenReconciliation) {
      MessageBox.warning("Já existe uma conferência em rascunho ou em aprovação para este armazém e produto.");
    }
  }

  async onWarehouseValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
    await this.applyValueHelp(ev, "WarehousesSelectDialog", ["Code", "Name", "TaxId", "FName"], "Code");
    await this.afterKeyFieldsChanged();
  }

  async onItemValueHelp(ev: Input$ValueHelpRequestEvent): Promise<void> {
    await this.applyValueHelp(ev, "ItemsSelectDialog", ["ItemCode", "ItemName"], "ItemCode");
    await this.afterKeyFieldsChanged();
  }

  onReferenceDateChange(): void {
    void this.afterKeyFieldsChanged();
  }

  onReportedBalanceChange(): void {
    this.updateDifference(this.getView().getBindingContext() as Context);
    this.autoFillSingleRelease();
    this.updateDistributionInfo();
  }

  /** Obrigatórios lidos do contexto: o Form com ColumnLayout não tem `getContent()`. */
  protected validateReconciliation(ctx: Context): boolean {
    const missing: string[] = [];
    const empty = (p: string) => !String(ctx?.getProperty(p) ?? "").trim();

    if (empty("BranchCode")) missing.push("Filial");
    if (empty("ReferenceDate")) missing.push("Data de referência");
    if (empty("WarehouseCode")) missing.push("Armazém");
    if (empty("ItemCode")) missing.push("Produto");
    if (empty("UnitOfMeasureCode")) missing.push("Unidade de medida");
    if (empty("ReasonKey")) missing.push("Motivo");

    if (missing.length) {
      MessageBox.warning(`Preencha os campos obrigatórios: ${missing.join(", ")}.`);
      return false;
    }

    if (Number(ctx.getProperty("ReportedBalance")) < 0) {
      MessageBox.warning("O saldo informado pelo armazém não pode ser negativo.");
      return false;
    }

    return true;
  }

  private _uploadDialog: Dialog;
  private _decisionDialog: Dialog;
  private _file: File;

  private static readonly UPLOAD_DIALOG = "siagrob1.view.warehouseReconciliations.fragments.AttachmentUploadDialog";
  private static readonly DECISION_DIALOG = "siagrob1.view.warehouseReconciliations.fragments.DecisionDialog";

  protected currentKey(): string {
    return (this.getView().getBindingContext() as Context)?.getProperty("Key") as string;
  }

  /** POST numa action; mostra a mensagem de negócio do servidor quando recusa. */
  protected async runAction(url: string, payload: object, successMessage: string): Promise<boolean> {
    this.setBusy(true);
    try {
      const result = await sendJson("POST", url, payload);
      if (!result.ok) {
        MessageBox.error(result.message);
        return false;
      }
      MessageToast.show(successMessage);
      return true;
    } finally {
      this.setBusy(false);
    }
  }

  protected async loadAttachments(key: string): Promise<void> {
    let model = this.getModel("attachments") as JSONModel;
    if (!model) {
      model = new JSONModel([]);
      this.getView().setModel(model, "attachments");
    }

    const result = await sendJson("GET", `${this.api.warehouseReconciliationsAttachmentsList}(ReconciliationKey=${key})`);
    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    // Function sem envelope devolve o array cru; com envelope, { value: [...] }. Chaves em qualquer caixa.
    const data = result.data;
    const rows = (Array.isArray(data) ? data : ((data as { value?: unknown[] })?.value ?? [])) as Record<string, unknown>[];
    model.setData(rows.map((r) => ({
      Key: r.Key ?? r.key,
      Description: r.Description ?? r.description,
      FileName: r.FileName ?? r.fileName,
      CreatedBy: r.CreatedBy ?? r.createdBy,
      CreatedAt: r.CreatedAt ?? r.createdAt,
    })));
  }

  async onOpenAttachmentUpload(): Promise<void> {
    this._uploadDialog ??= await DialogHelper.createDialog(this, BaseController.UPLOAD_DIALOG);
    this.wr().setProperty("/attachment/description", "");
    this._file = undefined;
    (Fragment.byId(`${this.getView().getId()}_${BaseController.UPLOAD_DIALOG}`, "attachmentFileUploader") as FileUploader)?.clear();
    this._uploadDialog.open();
  }

  onAttachmentFileChange(ev: FileUploader$ChangeEvent): void {
    const files = ev.getParameter("files") as unknown as File[];
    this._file = files?.length ? files[0] : undefined;
  }

  onCloseAttachmentUpload(): void {
    this._uploadDialog?.close();
  }

  async onConfirmAttachmentUpload(): Promise<void> {
    const description = String(this.wr().getProperty("/attachment/description") ?? "").trim();
    if (!description || !this._file) {
      MessageBox.warning("Informe a descrição e selecione o arquivo.");
      return;
    }

    const key = this.currentKey();
    const file = this._file;

    // A leitura do arquivo é assíncrona e pode falhar (arquivo corrompido, permissão negada
    // pelo navegador etc.) — sem o try/catch a rejeição ficava sem tratamento nenhum.
    let base64: string;
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          resolve(text.includes(",") ? text.split(",")[1] : text);
        };
        reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
        reader.readAsDataURL(file);
      });
    } catch (err) {
      MessageBox.error((err as Error).message || "Não foi possível ler o arquivo.");
      return;
    }

    const ok = await this.runAction(this.api.warehouseReconciliationsAttachmentUpload, {
      ReconciliationKey: key,
      Description: description,
      FileName: file.name,
      ContentType: file.type || "application/octet-stream",
      File: base64,
    }, "Anexo enviado.");

    if (ok) {
      this._uploadDialog.close();
      await this.loadAttachments(key);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private selectedAttachment(): Record<string, string> | null {
    const table = this.byId("warehouseReconciliationAttachmentsTable") as Table;
    const i = table?.getSelectedIndex() ?? -1;
    if (i < 0) {
      MessageBox.warning("Selecione um anexo.");
      return null;
    }
    return table.getContextByIndex(i).getObject() as Record<string, string>;
  }

  onDownloadAttachment(): void {
    const attachment = this.selectedAttachment();
    if (!attachment) return;

    fetch(`${this.api.warehouseReconciliationsAttachmentsDownload}(Key=${attachment.Key})`)
      .then((response) => {
        if (!response.ok) throw new Error("Erro ao baixar o anexo.");
        return response.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.FileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch(() => MessageToast.show("Erro ao baixar o anexo."));
  }

  async onDeleteAttachment(): Promise<void> {
    const attachment = this.selectedAttachment();
    if (!attachment) return;
    if (!(await DialogHelper.confirmDialog("Remover o anexo selecionado ?"))) return;

    const result = await sendJson("DELETE", `/odata/WarehouseReconciliationAttachments(${attachment.Key})`);
    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }
    await this.loadAttachments(this.currentKey());
  }

  protected async openDecision(
    action: string, title: string, confirmText: string, textLabel: string, textRequired: boolean
  ): Promise<void> {
    this._decisionDialog ??= await DialogHelper.createDialog(this, BaseController.DECISION_DIALOG);
    this.wr().setProperty("/dialog", { action, title, confirmText, textLabel, textRequired, text: "" });
    this._decisionDialog.open();
  }

  onCloseDecision(): void {
    this._decisionDialog?.close();
  }

  async onConfirmDecision(): Promise<void> {
    const dialog = this.wr().getProperty("/dialog") as { action: string; text: string; textLabel: string; textRequired: boolean };
    const text = String(dialog.text ?? "").trim();

    if (dialog.textRequired && !text) {
      MessageBox.warning(`Informe: ${dialog.textLabel}.`);
      return;
    }

    try {
      // O diálogo só fecha quando a ação é concluída: uma recusa do servidor (validação de
      // negócio, por exemplo) mantém o diálogo aberto com o texto já digitado em vez de
      // descartá-lo e obrigar o usuário a redigitar o motivo.
      if (await this.executeDecision(dialog.action, text || null)) {
        this._decisionDialog.close();
      }
    } catch (err) {
      MessageBox.error((err as Error).message || "Não foi possível concluir a operação.");
    }
  }

  /** Sobrescrito pelas telas que abrem o diálogo de decisão. Resolve `true` quando a ação foi concluída. */
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  protected executeDecision(action: string, text: string | null): Promise<boolean> {
    return Promise.reject(new Error(`Ação não suportada: ${action} (${text ?? ""})`));
  }
}
