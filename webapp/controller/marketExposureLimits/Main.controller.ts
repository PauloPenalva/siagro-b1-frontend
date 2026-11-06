import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import Event from "sap/ui/base/Event";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Sorter from "sap/ui/model/Sorter";
import Table from "sap/ui/table/Table";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import BaseController from "../BaseController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { saveMarketChanges } from "siagrob1/helpers/MarketLookups";
import {
  MARKET_BOARD_APPROVE, formatStrictDecimal, numberErrorKey, parseStrictDecimal
} from "siagrob1/helpers/MarketPricingHelpers";
import { ExposureLimitForm, buildExposureLimitPayload, limitPeriodText } from "siagrob1/helpers/MarketSetupHelpers";
import SessionService from "siagrob1/services/SessionService";
import { MarketCommodity, MarketExposureLimit } from "siagrob1/types/MarketSetup";

type LimitDialogModel = ExposureLimitForm & {
  title: string;
  isNew: boolean;
  commodities: MarketCommodity[];
};

type NumberField = "maxLong" | "maxShort";

const NUMBER_INPUTS: Record<NumberField, string> = { maxLong: "limitMaxLong", maxShort: "limitMaxShort" };

/**
 * Limites de exposição da posição de mercado (OData `MarketExposureLimits`): por commodity (t) ou dólar
 * (US$), no total ou num mês. Qualquer um vê; só quem tem `MARKET_BOARD_APPROVE` grava.
 *
 * @namespace siagrob1.controller.marketExposureLimits
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private dialog?: Dialog;
  /** Contexto em alteração; nulo = inclusão. */
  private editing: Context | null = null;
  private commodities: MarketCommodity[] = [];

  /** Formatters (campos de instância, não getters: o UI5 resolve `.nome` por nome). */
  scopeText = (scope: string): string => (scope ? this.text(`marketLimitScope_${scope}`) : "");
  periodText = (year: unknown, month: unknown): string => limitPeriodText(year, month, this.text("marketLimitTotal"));

  onInit(): void {
    this.getView().setModel(new JSONModel({ canApprove: false }), "view");
    this.getView().setModel(new JSONModel({}), "limit");
    this.getRouter().getRoute("marketExposureLimits").attachPatternMatched(() => void this.routeMatched());
  }

  private async routeMatched(): Promise<void> {
    (this.getView().getModel("view") as JSONModel).setProperty("/canApprove", SessionService.hasPermission(MARKET_BOARD_APPROVE));
    this.bundle ??= await this.getResourceBundle();
    this.commodities = await this.loadCommodities();
    if (!this.binding()) {
      this.table().bindRows({
        path: "/MarketExposureLimits",
        // A lista só pede o que as colunas usam (auto-$select): o diálogo de alteração precisa da chave
        // da commodity e do ano/mês crus, então eles vão explícitos.
        parameters: {
          $select: "Id,Scope,CommodityCode,Year,Month,MaxLong,MaxShort,Active,UpdatedBy,UpdatedAt",
          $expand: "Commodity($select=Code,Name)",
        },
        sorter: [new Sorter("Scope"), new Sorter("CommodityCode"), new Sorter("Year"), new Sorter("Month")],
      });
      return;
    }
    this.onRefresh();
  }

  private async loadCommodities(): Promise<MarketCommodity[]> {
    const model = this.getView().getModel() as ODataModel;
    const binding = model.bindList("/MarketCommodities", undefined, [new Sorter("Name")], undefined, { $select: "Code,Name,Active" });
    try {
      const contexts = await binding.requestContexts(0, 1000);
      return contexts.map((context) => context.getObject() as MarketCommodity);
    } catch {
      return [];
    } finally {
      binding.destroy();
    }
  }

  private text(key: string, args?: string[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  private table(): Table {
    return this.byId("tableMarketExposureLimits") as Table;
  }

  private binding(): ODataListBinding {
    return this.table().getBinding("rows") as ODataListBinding;
  }

  private limitModel(): JSONModel {
    return this.getView().getModel("limit") as JSONModel;
  }

  onRefresh(): void {
    this.binding()?.refresh();
  }

  private async openDialog(form: LimitDialogModel, editing: Context | null): Promise<void> {
    this.editing = editing;
    this.limitModel().setData(form);
    this.dialog ??= await this.loadFragment({ name: "siagrob1.view.marketExposureLimits.fragments.LimitDialog" }) as Dialog;
    this.markNumber(null, null);
    this.dialog.open();
  }

  onCreate(): void {
    const today = new Date();
    void this.openDialog({
      title: this.text("marketLimitTitleNew"), isNew: true,
      commodities: this.commodities.filter((c) => c.Active !== false),
      scope: "Commodity", commodityCode: "", total: true,
      year: today.getFullYear(), month: String(today.getMonth() + 1),
      maxLong: "", maxShort: "", active: true,
    }, null);
  }

  onEdit(): void {
    const context = this.getSelectRowContext(this.table());
    if (!context) {
      MessageBox.alert(this.text("commonSelectToEdit"));
      return;
    }
    const row = context.getObject() as MarketExposureLimit;
    const text = (value: number | string): string => (value === null || value === undefined ? "" : formatStrictDecimal(Number(value)));
    const total = row.Year === null || row.Year === undefined || row.Month === null || row.Month === undefined;
    const today = new Date();
    void this.openDialog({
      title: this.text("marketLimitTitleEdit"), isNew: false,
      // Na alteração todas (a atual pode estar inativa).
      commodities: this.commodities,
      scope: row.Scope, commodityCode: row.CommodityCode ?? row.Commodity?.Code ?? "", total,
      year: total ? today.getFullYear() : Number(row.Year), month: String(total ? today.getMonth() + 1 : row.Month),
      maxLong: text(row.MaxLong), maxShort: text(row.MaxShort), active: row.Active !== false,
    }, context);
  }

  /** Marca (ou limpa) o estado de erro dos campos de máximo. */
  private markNumber(field: NumberField, key: string): void {
    for (const [name, id] of Object.entries(NUMBER_INPUTS) as [NumberField, string][]) {
      const input = this.byId(id) as Input;
      if (!input) continue;
      const hasError = name === field && !!key;
      input.setValueState(hasError ? "Error" : "None");
      if (hasError) input.setValueStateText(this.text(key));
    }
  }

  /** Ao sair do campo: mostra o erro ou reescreve o valor como foi entendido. */
  onNumberChange(ev: Event): void {
    const source = ev.getSource();
    const field = (Object.keys(NUMBER_INPUTS) as NumberField[]).find((name) => this.byId(NUMBER_INPUTS[name]) === source);
    if (!field) return;
    const input = source as Input;
    const { value, error } = parseStrictDecimal(this.limitModel().getProperty(`/${field}`) as string);
    input.setValueState(error ? "Error" : "None");
    if (error) input.setValueStateText(this.text(numberErrorKey(error)));
    else if (value !== null) this.limitModel().setProperty(`/${field}`, formatStrictDecimal(value));
  }

  onDialogCancel(): void {
    this.dialog?.close();
  }

  async onDialogSave(): Promise<void> {
    const result = buildExposureLimitPayload(this.limitModel().getData() as LimitDialogModel);
    this.markNumber(result.field ?? null, result.field ? result.error : null);
    if (!result.payload) {
      MessageBox.warning(this.text(result.error));
      return;
    }

    const model = this.getView().getModel() as ODataModel;
    this.setBusy(true);
    try {
      let created: Context | undefined;
      if (this.editing) {
        for (const [name, value] of Object.entries(result.payload)) {
          void this.editing.setProperty(name, value).catch((): void => undefined);
        }
      } else {
        created = this.binding().create(result.payload, false, false, false);
      }
      if (await saveMarketChanges(model, created)) {
        this.dialog?.close();
        MessageToast.show(this.text(this.editing ? "commonUpdated" : "commonSaved"));
        // Atualizado por/em e o nome da commodity vêm do servidor.
        this.onRefresh();
      }
    } finally {
      this.setBusy(false);
    }
  }

  async onDelete(): Promise<void> {
    const context = this.getSelectRowContext(this.table());
    if (!context) {
      MessageBox.alert(this.text("commonSelectToDelete"));
      return;
    }
    if (!(await confirmDialog(this.text("commonDeleteConfirm"), this.text("commonDelete")))) return;

    this.setBusy(true);
    try {
      await context.delete("$auto");
      MessageToast.show(this.text("commonDeleted"));
    } catch {
      // erro já exibido pelo handler global de mensagens
    } finally {
      this.setBusy(false);
    }
  }
}
