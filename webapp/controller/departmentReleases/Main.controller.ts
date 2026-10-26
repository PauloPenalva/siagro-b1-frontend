import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import formatter from "siagrob1/model/formatter";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Table from "sap/ui/table/Table";
import Context from "sap/ui/model/odata/v4/Context";
import JSONModel from "sap/ui/model/json/JSONModel";
import { RowActionItem$PressEvent } from "sap/ui/table/RowActionItem";
import { ValueState } from "sap/ui/core/library";
import { anyOfFilter } from "siagrob1/helpers/FilterHelpers";
import { sendJson } from "siagrob1/helpers/FetchHelpers";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import SessionService from "siagrob1/services/SessionService";
import CommonController from "../common/CommonController";
import { Select$ChangeEvent } from "sap/m/Select";
import { Column, EdmType, SpreadsheetSettings } from "sap/ui/export/library";
import Spreadsheet from "sap/ui/export/Spreadsheet";
import { SortOrder } from "sap/ui/core/library";
import { mapPaymentReleaseExportRow, PAYMENT_RELEASE_EXPORT_DEPARTMENTS } from "siagrob1/helpers/PaymentReleaseExportHelpers";
import {
  applyHistoryDepartmentFilter, clearHistoryDepartmentFilter, DEPARTMENT_RELEASES, HISTORY_ALL_DEPARTMENTS,
  historyDepartmentOptions, mapReleaseHistory, ReleaseHistoryRow, releasedDepartmentCodes,
  defaultReleaseFilters, departmentReleaseFilterClauses,
} from "siagrob1/helpers/DepartmentReleaseHelpers";

type FilterData = {
  PaymentReleaseStatus?: string[],
  CardCode?: string,
  CreationDateFrom?: string,
  CreationDateTo?: string,
  Release?: Record<string, string>,
}

type SelectedContract = { key: string; code: string; isBarter: boolean; releasedDepartments: string[] };

/**
 * Liberação por Departamento (GAC-1188): cada usuário vê e altera só os departamentos que as
 * suas permissões PAYMENT_RELEASE_* permitem. Marcar e desmarcar exigem motivo e entram no
 * histórico do contrato.
 *
 * @namespace siagrob1.controller.departmentReleases
 */
export default class Main extends CommonController {

  formatter = formatter;

  private actionDialog: Dialog;
  private historyDialog: Dialog;

  /** `$filter` corrente da filterbar, reaproveitado pelo binding do export. */
  private currentFilter: string;

  onInit(): void {
    this.createFilterModel({ PaymentReleaseStatus: [], Release: defaultReleaseFilters() });
    this.getView().setModel(new JSONModel({}), "perm");
    this.getView().setModel(new JSONModel({}), "dlg");
    this.getView().setModel(new JSONModel({}), "history");

    this.getRouter().getRoute("departmentReleases")
      .attachPatternMatched(() => void this.onRouteMatched());
  }

  private async onRouteMatched(): Promise<void> {
    await SessionService.whenReady();
    (this.getModel("perm") as JSONModel).setData(
      Object.fromEntries(DEPARTMENT_RELEASES.map((d) => [d.code, SessionService.hasPermission(d.permission)])));
    this.applyFilters();
  }

  /** Departamentos que o usuário corrente pode ver e alterar. */
  private allowedDepartments() {
    return DEPARTMENT_RELEASES.filter((d) => SessionService.hasPermission(d.permission));
  }

  onClearFilters() {
    this.clearFilters();
    this.applyFilters();
  }

  onSearch(): void {
    this.applyFilters();
  }

  private applyFilters() {
    const oBinding = this.getView().byId("tableDepartmentReleases").getBinding("rows") as ODataListBinding;
    const filterData = (this.getModel("filter") as JSONModel).getData() as FilterData;
    const filters: string[] = [];

    const statuses = filterData.PaymentReleaseStatus ?? [];
    if (statuses.length > 0) {
      // O backend grava "sem status" como nulo ou Pending; os dois valem "Pendente" na tela.
      const others = statuses.filter((s) => s !== "Pending");
      const parts: string[] = [];
      if (statuses.includes("Pending")) {
        parts.push("PaymentReleaseStatus eq null", "PaymentReleaseStatus eq 'Pending'");
      }
      const rest = anyOfFilter("PaymentReleaseStatus", others);
      if (rest) parts.push(rest);
      filters.push(parts.length > 1 ? `(${parts.join(" or ")})` : parts[0]);
    }

    if (filterData.CardCode) filters.push(`contains(CardCode,'${filterData.CardCode.replace(/'/g, "''")}')`);
    if (filterData.CreationDateFrom) filters.push(`CreationDate ge ${filterData.CreationDateFrom}`);
    if (filterData.CreationDateTo) filters.push(`CreationDate le ${filterData.CreationDateTo}`);

    filters.push(...departmentReleaseFilterClauses(filterData.Release, this.allowedDepartments().map((d) => d.code)));

    const filterParam = filters.length > 0 ? filters.join(" and ") : undefined;
    this.currentFilter = filterParam;
    oBinding.changeParameters({ $filter: filterParam });
  }

  onRowNavigate(ev: RowActionItem$PressEvent): void {
    const ctx = ev.getParameter("row").getBindingContext() as Context;
    this.navTo("purchaseContractsDetail", { id: ctx.getProperty("Key") as string });
  }

  /** Contrato da linha selecionada, ou indefinido (com aviso) quando não há seleção. */
  private selectedContract(): SelectedContract {
    const oTable = this.byId("tableDepartmentReleases") as Table;
    const i = oTable.getSelectedIndex();

    if (i < 0) {
      MessageBox.warning("Selecione um contrato.");
      return undefined;
    }

    const ctx = oTable.getContextByIndex(i);
    return {
      key: ctx.getProperty("Key") as string,
      code: String(ctx.getProperty("Code") ?? ""),
      isBarter: !!ctx.getProperty("IsBarter"),
      releasedDepartments: releasedDepartmentCodes(
        ctx.getObject("PaymentReleases") as { Department: string; Released?: boolean }[]),
    };
  }

  onDetail(): void {
    const contract = this.selectedContract();
    if (contract) this.navTo("purchaseContractsDetail", { id: contract.key });
  }

  onRelease(): void {
    void this.openActionDialog(true);
  }

  onWithdrawRelease(): void {
    void this.openActionDialog(false);
  }

  private async openActionDialog(released: boolean): Promise<void> {
    const contract = this.selectedContract();
    if (!contract) return;

    // A Loja só participa de contrato de barter.
    const permitted = this.allowedDepartments().filter((d) => d.code !== "Store" || contract.isBarter);

    if (permitted.length === 0) {
      MessageBox.warning("Você não tem permissão para liberar departamentos deste contrato.");
      return;
    }

    // Liberar só oferece quem ainda não está liberado; retirar, só quem está.
    const departments = permitted
      .filter((d) => contract.releasedDepartments.includes(d.code) !== released)
      .map(({ code, label }) => ({ code, label }));

    if (departments.length === 0) {
      MessageBox.information(released
        ? "Nenhum departamento disponível para liberar neste contrato."
        : "Nenhum departamento liberado para retirar neste contrato.");
      return;
    }

    (this.getModel("dlg") as JSONModel).setData({
      title: released ? "Liberar departamento" : "Retirar liberação",
      key: contract.key,
      released,
      contract: contract.code,
      departments,
      department: departments.length === 1 ? departments[0].code : "",
      reason: "",
      reasonState: ValueState.None,
    });

    this.actionDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.departmentReleases.fragments.DepartmentReleaseActionDialog"
    );
    this.actionDialog.open();
  }

  onReasonLiveChange(): void {
    const dlg = this.getModel("dlg") as JSONModel;
    if (((dlg.getProperty("/reason") as string) ?? "").trim()) {
      dlg.setProperty("/reasonState", ValueState.None);
    }
  }

  onCancelDepartmentRelease(): void {
    this.actionDialog?.close();
  }

  async onConfirmDepartmentRelease(): Promise<void> {
    const dlg = this.getModel("dlg") as JSONModel;
    const department = dlg.getProperty("/department") as string;
    const reason = ((dlg.getProperty("/reason") as string) ?? "").trim();

    if (!department) {
      MessageBox.warning("Selecione o departamento.");
      return;
    }
    if (!reason) {
      dlg.setProperty("/reasonState", ValueState.Error);
      return;
    }

    this.actionDialog.setBusy(true);
    const result = await sendJson("POST", this.api.purchaseContractsSetDepartmentRelease, {
      Key: dlg.getProperty("/key") as string,
      Department: department,
      Released: dlg.getProperty("/released") as boolean,
      Reason: reason,
    });
    this.actionDialog.setBusy(false);

    if (!result.ok) {
      MessageBox.error(result.message ?? "Erro ao atualizar a liberação do departamento.");
      return;
    }

    this.actionDialog.close();
    MessageToast.show("Liberação atualizada.");
    (this.byId("tableDepartmentReleases").getBinding("rows") as ODataListBinding).refresh();
  }

  async onHistory(): Promise<void> {
    const contract = this.selectedContract();
    if (!contract) return;

    const allowed = this.allowedDepartments().map((d) => d.code);
    const model = this.getModel() as ODataModel;
    const binding = model.bindContext(`/PurchaseContracts(${contract.key})`, undefined, {
      $select: "Key",
      $expand: { PaymentReleaseHistory: { $orderby: "ChangedAt desc" } },
    });

    let rows: ReleaseHistoryRow[];
    try {
      const data = await binding.requestObject() as { PaymentReleaseHistory?: ReleaseHistoryRow[] };
      rows = data.PaymentReleaseHistory ?? [];
    } catch {
      MessageBox.error("Erro ao carregar o histórico de liberações.");
      return;
    } finally {
      // Binding avulso: sem destruir, cada abertura deixaria um listener vivo no modelo.
      binding.destroy();
    }

    (this.getModel("history") as JSONModel).setData({
      title: `Histórico de liberações - ${contract.code}`,
      items: mapReleaseHistory(rows, allowed),
      departments: historyDepartmentOptions(allowed),
      department: HISTORY_ALL_DEPARTMENTS,
    });

    this.historyDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.departmentReleases.fragments.DepartmentReleaseHistoryDialog"
    );
    clearHistoryDepartmentFilter(this.historyDialog);
    this.historyDialog.open();
  }

  onHistoryDepartmentChange(ev: Select$ChangeEvent): void {
    applyHistoryDepartmentFilter(ev.getSource());
  }

  onCloseDepartmentReleaseHistory(): void {
    this.historyDialog?.close();
  }

  private createColumnConfig(): Column[] {
    const allowed = this.allowedDepartments().map((d) => d.code);
    return [
      { label: "Contrato", property: "Code", type: EdmType.String },
      { label: "Emissão", property: "CreationDate", type: EdmType.Date },
      { label: "Fornecedor", property: "CardName", type: EdmType.String },
      {
        label: "Status Financeiro",
        property: "PaymentReleaseStatus",
        type: EdmType.Enumeration,
        valueMap: {
          "Pending": "Pendente",
          "UnderReview": "Em análise",
          "IncompleteDocuments": "Documentação incompleta",
          "Approved": "Aprovado",
          "PreApproved": "Pré-aprovado",
        },
      },
      ...PAYMENT_RELEASE_EXPORT_DEPARTMENTS
        .filter(([code]) => allowed.includes(code))
        .map(([, property, label]): Column => ({ label, property, type: EdmType.String })),
    ];
  }

  /** Lê os contratos com PaymentReleases expandido, na ordem e com o filtro da tela. */
  private async loadExportRows(cols: Column[], orderby: string): Promise<Record<string, unknown>[]> {
    const select = new Set<string>(["Key", "IsBarter"]);
    cols.forEach((c) => {
      if (!PAYMENT_RELEASE_EXPORT_DEPARTMENTS.some(([, property]) => property === c.property)) {
        select.add(c.property as string);
      }
    });

    const parameters: Record<string, string> = {
      $orderby: orderby,
      $select: [...select].join(","),
      $expand: "PaymentReleases($select=Department,Released)",
    };
    if (this.currentFilter) parameters.$filter = this.currentFilter;

    const binding = (this.getModel() as ODataModel).bindList("/PurchaseContracts", undefined, undefined, undefined, parameters);
    try {
      const contexts = await binding.requestContexts(0, Number.MAX_SAFE_INTEGER);
      return contexts.map((ctx) => mapPaymentReleaseExportRow(ctx.getObject() as Record<string, unknown>));
    } finally {
      binding.destroy();
    }
  }

  private getExportOrderBy(oTable: Table): string {
    const aOrder = oTable.getSortedColumns()
      .filter((oColumn) => oColumn.getSortOrder() !== SortOrder.None && oColumn.getSortProperty())
      .map((oColumn) => oColumn.getSortProperty()
        + (oColumn.getSortOrder() === SortOrder.Descending ? " desc" : ""));

    return aOrder.length > 0 ? aOrder.join(",") : "RowId desc";
  }

  async onExcel() {
    const oTable = this.byId("tableDepartmentReleases") as Table;
    const cols = this.orderExportColumns(oTable, this.createColumnConfig());

    const setting: SpreadsheetSettings = {
      dataSource: await this.loadExportRows(cols, this.getExportOrderBy(oTable)),
      fileName: "Liberação por Departamento.xlsx",
      workbook: {
        columns: cols,
        context: { sheetName: "Liberação por Departamento" },
      },
    };

    const oSheet = new Spreadsheet(setting);
    void oSheet.build().finally(function () {
      oSheet.destroy();
    });
  }
}
