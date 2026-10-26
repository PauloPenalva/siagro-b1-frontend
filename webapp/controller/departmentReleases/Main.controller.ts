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
import { DEPARTMENT_RELEASES, mapReleaseHistory, ReleaseHistoryRow } from "siagrob1/helpers/DepartmentReleaseHelpers";

type FilterData = {
  PaymentReleaseStatus?: string[],
  CardCode?: string,
  CreationDateFrom?: string,
  CreationDateTo?: string,
}

type SelectedContract = { key: string; code: string; isBarter: boolean };

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

  onInit(): void {
    this.createFilterModel({ PaymentReleaseStatus: [] });
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

    oBinding.changeParameters({ $filter: filters.length > 0 ? filters.join(" and ") : undefined });
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
    const departments = this.allowedDepartments()
      .filter((d) => d.code !== "Store" || contract.isBarter)
      .map(({ code, label }) => ({ code, label }));

    if (departments.length === 0) {
      MessageBox.warning("Você não tem permissão para liberar departamentos deste contrato.");
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
    });

    this.historyDialog ??= await DialogHelper.createDialog(
      this,
      "siagrob1.view.departmentReleases.fragments.DepartmentReleaseHistoryDialog"
    );
    this.historyDialog.open();
  }

  onCloseDepartmentReleaseHistory(): void {
    this.historyDialog?.close();
  }
}
