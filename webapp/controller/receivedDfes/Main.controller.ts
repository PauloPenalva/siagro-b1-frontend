import Table from "sap/ui/table/Table";
import Dialog from "sap/m/Dialog";
import Fragment from "sap/ui/core/Fragment";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import Context from "sap/ui/model/odata/v4/Context";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import { Link$PressEvent } from "sap/m/Link";
import { ListBase$DeleteEvent } from "sap/m/ListBase";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { odataValue, readErrorMessage, sendJson } from "siagrob1/helpers/FetchHelpers";
import formatter from "siagrob1/model/formatter";
import { openNfeCancelDialog } from "siagrob1/dialogs/NfeCancelDialog";
import CommonController from "siagrob1/controller/common/CommonController";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { Column as ExportColumn, EdmType } from "sap/ui/export/library";

type ManifestType = "Confirmation" | "Acknowledgement" | "Unknown" | "NotPerformed";

type ReceivedDfeRow = {
  Id: number;
  Situation: string;
  ManifestationStatus: string;
  XmlDownloadedAt?: string;
  PurchaseInvoiceDocEntry?: number;
};

const SITUATION_TEXT: Record<string, string> = { Authorized: "Autorizada", Denied: "Denegada", Cancelled: "Cancelada" };
const MANIFESTATION_TEXT: Record<string, string> = {
  None: "Sem manifestação", Acknowledged: "Ciência", Confirmed: "Confirmada",
  Unknown: "Desconhecida", NotPerformed: "Não realizada",
};
const MANIFESTATION_STATE: Record<string, string> = {
  None: "None", Acknowledged: "Information", Confirmed: "Success", Unknown: "Error", NotPerformed: "Warning",
};

/** Literal de string OData: aspas simples dobradas. */
const odataText = (value: string): string => value.replace(/'/g, "''");

/** Lê uma propriedade de resposta crua do OData, que pode vir em PascalCase ou camelCase. */
const prop = <T>(obj: unknown, name: string): T => {
  const o = (obj ?? {}) as Record<string, unknown>;
  return (o[name] ?? o[name.charAt(0).toLowerCase() + name.slice(1)]) as T;
};

/**
 * Manifestação do Destinatário: DF-e destinados à filial (Distribuição de DF-e da SEFAZ), com ciência,
 * confirmação, desconhecimento, operação não realizada, download do XML e entrada no Documento de Entrada.
 *
 * @namespace siagrob1.controller.receivedDfes
 */
export default class Main extends CommonController {
  formatter = {
    ...formatter,
    /** Número da NF-e: posições 26 a 34 da chave de acesso (44 dígitos). */
    accessKeyNumber: (key: string) => (key && key.length === 44 ? String(Number(key.substring(25, 34))) : ""),
    dfeSituationText: (value: string) => SITUATION_TEXT[value] ?? value ?? "",
    dfeSituationState: (value: string) => (value === "Authorized" ? "Success" : "Error"),
    dfeManifestationText: (value: string) => MANIFESTATION_TEXT[value] ?? value ?? "",
    dfeManifestationState: (value: string) => MANIFESTATION_STATE[value] ?? "None",
  };

  private scheduleDialog: Dialog;

  /** Exporta a lista como está na tela (mesmos filtros e ordem do binding da tabela). */
  onExcel(): void {
    const columns: ExportColumn[] = [
      { label: "Emissão", property: "IssueDate", type: EdmType.DateTime, format: "dd/mm/yyyy" },
      { label: "CNPJ", property: "IssuerTaxId", type: EdmType.String },
      { label: "Emitente", property: "IssuerName", type: EdmType.String },
      { label: "Chave de acesso", property: "AccessKey", type: EdmType.String },
      { label: "Valor", property: "TotalValue", type: EdmType.Number, scale: 2, delimiter: true },
      { label: "Situação", property: "Situation", type: EdmType.Enumeration, valueMap: SITUATION_TEXT },
      { label: "Manifestação", property: "ManifestationStatus", type: EdmType.Enumeration, valueMap: MANIFESTATION_TEXT },
    ];
    const sheet = new Spreadsheet({
      dataSource: this.itemsBinding(),
      fileName: "Manifestação do Destinatário.xlsx",
      workbook: { columns, context: { sheetName: "DF-e" } },
    });
    void sheet.build().finally(() => sheet.destroy());
  }

  onInit(): void {
    this.createFilterModel({ BranchCode: "", DateFrom: "", DateTo: "", Issuer: "", ManifestationStatus: "", Situation: "" });
    this.getView().setModel(new JSONModel(Main.emptyFlags()), "dfe");
    this.getView().setModel(new JSONModel({ times: [] }), "schedule");

    this.getRouter().getRoute("receivedDfes").attachPatternMatched(() => void this.routeMatched());
  }

  private static emptyFlags() {
    return { canAcknowledge: false, canManifest: false, canDownload: false, canEnter: false };
  }

  private async routeMatched(): Promise<void> {
    await this.fillDefaultBranch();
    this.applyFilters();
  }

  /** Filial da sessão como padrão, sem sobrescrever a que o usuário já escolheu. */
  private async fillDefaultBranch(): Promise<void> {
    const filterModel = this.getModel("filter") as JSONModel;
    if (filterModel.getProperty("/BranchCode")) {
      return;
    }
    try {
      const branch = await this.getBranchInfo();
      filterModel.setProperty("/BranchCode", branch?.code ?? "");
    } catch {
      // sem filial da sessão: o usuário escolhe pelo filtro
    }
  }

  onSearch(): void {
    this.applyFilters();
  }

  onClearFilters(): void {
    this.clearFilters();
    void this.fillDefaultBranch().then(() => this.applyFilters());
  }

  onRefresh(): void {
    this.itemsBinding()?.refresh();
  }

  private table(): Table {
    return this.byId("receivedDfesTable") as Table;
  }

  private itemsBinding(): ODataListBinding {
    return this.table().getBinding("rows") as ODataListBinding;
  }

  private filterBranch(): string {
    return ((this.getModel("filter") as JSONModel).getProperty("/BranchCode") as string ?? "").trim();
  }

  /**
   * O servidor não filtra por filial, então o BranchCode entra SEMPRE no `$filter` (sem filial a lista fica vazia).
   * Os enums vão como `eq 'valor'` em string crua: sap.ui.model.Filter não sabe formatar enum.
   * "Emissão até" inclui o dia inteiro: `lt` à meia-noite local do dia seguinte.
   */
  private applyFilters(): void {
    const data = ((this.getModel("filter") as JSONModel).getData() ?? {}) as Record<string, string>;
    const filters: string[] = [`BranchCode eq '${odataText(this.filterBranch())}'`];

    if (data.DateFrom) {
      const [y, m, d] = data.DateFrom.split("-").map(Number);
      filters.push(`IssueDate ge ${new Date(y, m - 1, d).toISOString()}`);
    }
    if (data.DateTo) {
      const [y, m, d] = data.DateTo.split("-").map(Number);
      filters.push(`IssueDate lt ${new Date(y, m - 1, d + 1).toISOString()}`);
    }
    if (data.Issuer?.trim()) {
      const text = odataText(data.Issuer.trim());
      const digits = data.Issuer.replace(/\D/g, "");
      filters.push(digits
        ? `(contains(IssuerName,'${text}') or contains(IssuerTaxId,'${digits}'))`
        : `contains(IssuerName,'${text}')`);
    }
    if (data.ManifestationStatus) {
      filters.push(`ManifestationStatus eq '${data.ManifestationStatus}'`);
    }
    if (data.Situation) {
      filters.push(`Situation eq '${data.Situation}'`);
    }

    this.itemsBinding().changeParameters({ $filter: filters.join(" and ") });
  }

  /* ------------------------------------------------------------------ */
  /* Seleção e habilitação dos botões                                    */
  /* ------------------------------------------------------------------ */

  private selectedRows(): ReceivedDfeRow[] {
    const table = this.table();
    return table.getSelectedIndices()
      .map(i => table.getContextByIndex(i) as Context)
      .filter(c => !!c)
      .map(c => c.getObject() as ReceivedDfeRow);
  }

  onUpdateFinished(): void {
    // A lista recarregou (filtro/refresh): a seleção anterior não vale mais.
    this.table().clearSelection();
    this.refreshFlags();
  }

  onSelectionChange(): void {
    this.refreshFlags();
  }

  /**
   * Ciência só de None; Confirmar/Desconhecer/Não realizada de None ou Ciência; Baixar XML em qualquer linha;
   * Dar entrada só com UMA linha Confirmada, não cancelada e sem entrada. Ação em lote exige que TODAS as
   * linhas selecionadas a admitam.
   */
  private refreshFlags(): void {
    const rows = this.selectedRows();
    const model = this.getModel("dfe") as JSONModel;
    const any = rows.length > 0;

    model.setData({
      canAcknowledge: any && rows.every(r => r.ManifestationStatus === "None"),
      canManifest: any && rows.every(r => r.ManifestationStatus === "None" || r.ManifestationStatus === "Acknowledged"),
      canDownload: any,
      canEnter: rows.length === 1 && rows[0].ManifestationStatus === "Confirmed"
        && rows[0].Situation !== "Cancelled" && rows[0].PurchaseInvoiceDocEntry == null,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Consulta à SEFAZ e agendamento                                      */
  /* ------------------------------------------------------------------ */

  async onSync(): Promise<void> {
    const branchCode = this.filterBranch();
    if (!branchCode) {
      MessageBox.warning("Informe a filial no filtro.");
      return;
    }

    this.setBusy(true);
    try {
      const result = await sendJson("POST", this.api.receivedDfesSync, { BranchCode: branchCode });
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }

      const data = odataValue<unknown>(result.data);
      const message = prop<string>(data, "Message")
        || `${prop<number>(data, "NewDocuments") ?? 0} novo(s), ${prop<number>(data, "UpdatedDocuments") ?? 0} atualizado(s).`;
      MessageBox.information(message);
      this.onRefresh();
    } finally {
      this.setBusy(false);
    }
  }

  private static formatInstant(value: string): string {
    return value ? formatter.formatDateTime(value) : "—";
  }

  async onSchedule(): Promise<void> {
    const branchCode = this.filterBranch();
    if (!branchCode) {
      MessageBox.warning("Informe a filial no filtro.");
      return;
    }

    this.setBusy(true);
    let state: unknown;
    try {
      const result = await sendJson("GET",
        `${this.api.branchDfeSyncStates}?$filter=${encodeURIComponent(`BranchCode eq '${odataText(branchCode)}'`)}`);
      if (!result.ok) {
        MessageBox.error(result.message);
        return;
      }
      state = odataValue<unknown[]>(result.data)?.[0];
    } finally {
      this.setBusy(false);
    }

    const times = (prop<string>(state, "ScheduleTimes") ?? "").split(";").map(t => t.trim()).filter(Boolean);
    (this.getModel("schedule") as JSONModel).setData({
      branchCode,
      pick: "",
      times: times.map(time => ({ time })),
      lastQueryAt: Main.formatInstant(prop<string>(state, "LastQueryAt")),
      nextAllowedAt: Main.formatInstant(prop<string>(state, "NextQueryAllowedAt")),
    });

    if (!this.scheduleDialog) {
      this.scheduleDialog = await Fragment.load({
        name: "siagrob1.view.receivedDfes.fragments.ScheduleDialog",
        controller: this,
        id: this.getView().getId(),
      }) as Dialog;
      this.getView().addDependent(this.scheduleDialog);
    }
    this.scheduleDialog.open();
  }

  onScheduleAddTime(): void {
    const model = this.getModel("schedule") as JSONModel;
    const pick = (model.getProperty("/pick") as string ?? "").trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(pick)) {
      MessageToast.show("Informe um horário válido (HH:mm).");
      return;
    }

    const times = (model.getProperty("/times") as { time: string }[]).map(t => t.time);
    if (!times.includes(pick)) {
      times.push(pick);
      times.sort();
      model.setProperty("/times", times.map(time => ({ time })));
    }
    model.setProperty("/pick", "");
  }

  onScheduleRemoveTime(ev: ListBase$DeleteEvent): void {
    const model = this.getModel("schedule") as JSONModel;
    const path = ev.getParameter("listItem").getBindingContext("schedule").getPath();
    const index = Number(path.split("/").pop());
    const times = model.getProperty("/times") as { time: string }[];
    times.splice(index, 1);
    model.setProperty("/times", times);
  }

  async onScheduleSave(): Promise<void> {
    const model = this.getModel("schedule") as JSONModel;
    const times = (model.getProperty("/times") as { time: string }[]).map(t => t.time);

    const result = await sendJson("POST", this.api.branchDfeSyncStatesSetSchedule,
      { BranchCode: model.getProperty("/branchCode") as string, Times: times });
    if (!result.ok) {
      MessageBox.error(result.message);
      return;
    }

    this.scheduleDialog.close();
    MessageToast.show(times.length ? "Agendamento salvo." : "Consulta automática desligada.");
  }

  onScheduleClose(): void {
    this.scheduleDialog.close();
  }

  /* ------------------------------------------------------------------ */
  /* Manifestação                                                        */
  /* ------------------------------------------------------------------ */

  onAcknowledge(): Promise<void> {
    return this.manifest("Acknowledgement");
  }

  onConfirm(): Promise<void> {
    return this.manifest("Confirmation");
  }

  async onUnknown(): Promise<void> {
    if (!await confirmDialog(
      "Desconhecer a operação é definitivo: não poderá ser desfeito nem substituído por outra manifestação. Continuar?",
      "Desconhecer operação ?")) {
      return;
    }
    await this.manifest("Unknown");
  }

  async onNotPerformed(): Promise<void> {
    if (!await confirmDialog(
      "Informar que a operação não foi realizada é definitivo e não poderá ser desfeito. Continuar?",
      "Operação não realizada ?")) {
      return;
    }

    const justification = await openNfeCancelDialog(this.getView(), {
      title: "Operação não realizada",
      confirm: "Informar à SEFAZ",
      warning: "A manifestação é enviada à SEFAZ e é definitiva.",
    });
    if (justification === null) {
      return;
    }
    await this.manifest("NotPerformed", justification);
  }

  /** Manifesta cada linha selecionada em sequência e reúne os erros numa única mensagem. */
  private async manifest(type: ManifestType, justification?: string): Promise<void> {
    const rows = this.selectedRows();
    if (!rows.length) {
      return;
    }

    const errors: string[] = [];
    this.setBusy(true);
    try {
      for (const row of rows) {
        const result = await sendJson("POST", this.api.receivedDfesManifest,
          { Id: row.Id, Type: type, Justification: justification ?? null });
        if (!result.ok) {
          errors.push(result.message);
        }
      }
    } finally {
      this.setBusy(false);
      this.onRefresh();
    }

    if (errors.length) {
      MessageBox.error(errors.join("\n"));
    } else {
      MessageToast.show("Manifestação registrada na SEFAZ.");
    }
  }

  /* ------------------------------------------------------------------ */
  /* XML, entrada e documento vinculado                                  */
  /* ------------------------------------------------------------------ */

  async onDownloadXml(): Promise<void> {
    const rows = this.selectedRows();
    if (!rows.length) {
      return;
    }

    if (rows.some(r => r.ManifestationStatus === "None") && !await confirmDialog(
      "Baixar o XML registra a Ciência da Operação na SEFAZ para os documentos ainda sem manifestação. Continuar?",
      "Baixar XML ?")) {
      return;
    }

    this.setBusy(true);
    try {
      for (const row of rows) {
        const result = await sendJson("GET", `${this.api.receivedDfesXml}(Id=${row.Id})`);
        if (!result.ok) {
          MessageBox.error(result.message);
          continue;
        }

        const data = odataValue<unknown>(result.data);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([prop<string>(data, "XmlContent")], { type: "application/xml" }));
        link.download = prop<string>(data, "FileName") || `${row.Id}.xml`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 60000);
      }
    } catch (error) {
      MessageBox.error((error as Error)?.message || "Falha ao baixar o XML.");
    } finally {
      this.setBusy(false);
      this.onRefresh();
    }
  }

  onEnter(): void {
    const row = this.selectedRows()[0];
    if (row) {
      this.navTo("purchaseInvoicesAdd", { "?query": { dfe: row.Id } });
    }
  }

  /** `PurchaseInvoiceDocEntry` guarda o RowId do documento; a rota de detalhe usa a chave Guid. */
  async onOpenEntry(ev: Link$PressEvent): Promise<void> {
    const docEntry = (ev.getSource().getBindingContext() as Context).getProperty("PurchaseInvoiceDocEntry") as number;

    this.setBusy(true);
    try {
      const response = await fetch(`${this.api.purchaseInvoicesLookup}?$filter=RowId eq ${docEntry}&$select=Key`);
      if (!response.ok) {
        MessageBox.error(await readErrorMessage(response) || "Não foi possível localizar o Documento de Entrada.");
        return;
      }

      const key = ((await response.json()) as { value: { Key?: string; key?: string }[] }).value?.[0];
      const id = key?.Key ?? key?.key;
      if (!id) {
        MessageBox.warning("O Documento de Entrada vinculado não foi encontrado.");
        return;
      }
      this.navTo("purchaseInvoicesDetail", { id });
    } finally {
      this.setBusy(false);
    }
  }
}
