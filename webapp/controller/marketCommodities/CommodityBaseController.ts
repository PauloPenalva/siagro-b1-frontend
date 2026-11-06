import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Button$PressEvent } from "sap/m/Button";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import Form from "sap/ui/layout/form/Form";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
import BaseController from "../BaseController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";
import { MARKET_MANAGE } from "siagrob1/helpers/MarketPricingHelpers";
import {
  CommodityMonthRow, commodityItemsProblem, commodityMonthsProblem, defaultCommodityMonth, missingDeliveryMonths
} from "siagrob1/helpers/MarketSetupHelpers";
import SessionService from "siagrob1/services/SessionService";

/**
 * Base das telas de inclusão/alteração de commodity: cabeçalho OData deferido + produtos (`Items`) +
 * mapa dos 12 meses de entrega (`Months`), gravados juntos num único `$batch` (molde das corretoras).
 *
 * @namespace siagrob1.controller.marketCommodities
 */
export default class CommodityBaseController extends BaseController {
  protected bundle?: ResourceBundle;
  private ownRoute?: string;
  /** A rota própria é a ativa: só então a saída dela descarta pendências. */
  private routeActive = false;
  /** Sobe a cada saída da rota: carga assíncrona de uma visita que já acabou não pode mexer no model. */
  protected leaveSeq = 0;

  /** O `UpdateGroup` é do app inteiro: ao ir para outra rota, descarta o que ficou pendente aqui. */
  protected watchLeave(ownRoute: string): void {
    this.ownRoute = ownRoute;
    this.getRouter().getRoute(ownRoute).attachPatternMatched(() => { this.routeActive = true; });
    this.getRouter().attachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  onExit(): void {
    this.getRouter().detachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  private readonly onBeforeRouteMatched = (ev: Router$BeforeRouteMatchedEvent): void => {
    if (!this.routeActive || ev.getParameter("name") === this.ownRoute) return;
    this.routeActive = false;
    this.leaveSeq++;
    this.discardChanges();
  };

  /** Desfaz o que estiver pendente no grupo (inclui contextos transitórios) e solta o contexto da tela. */
  protected discardChanges(): void {
    const model = this.getView().getModel() as ODataModel;
    const groupId = model.getUpdateGroupId();
    if (model.hasPendingChanges(groupId)) model.resetChanges(groupId);
    this.getView().setBindingContext(null);
  }

  protected initModels(isNew: boolean): void {
    this.getView().setModel(new JSONModel({ canManage: false, isNew }), "view");
  }

  /** Prepara a tela: permissão, textos e limpa pendências. */
  protected async prepare(): Promise<void> {
    (this.getView().getModel("view") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    clearFieldStates(this.byId("formMarketCommodity") as Form);
    const model = this.getView().getModel() as ODataModel;
    if (model.hasPendingChanges(model.getUpdateGroupId())) model.resetChanges(model.getUpdateGroupId());
  }

  protected text(key: string, args?: string[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  /** Nome do mês (1–12) para a coluna "Mês de entrega". */
  monthName = (month: unknown): string => {
    const value = Number(month);
    return value >= 1 && value <= 12 ? this.text(`marketMonth_${value}`) : "";
  };

  private itemsTable(): Table {
    return this.byId("tableCommodityItems") as Table;
  }

  private itemsBinding(): ODataListBinding {
    return this.itemsTable().getBinding("rows") as ODataListBinding;
  }

  protected monthsBinding(): ODataListBinding {
    return (this.byId("tableCommodityMonths") as Table).getBinding("rows") as ODataListBinding;
  }

  /** Completa o mapa com os meses de entrega que faltam (cadastro novo: os 12). */
  protected fillMissingMonths(atStart = false): void {
    const binding = this.monthsBinding();
    if (!binding) return;
    const rows = binding.getAllCurrentContexts().map((context) => context.getObject() as CommodityMonthRow);
    const missing = missingDeliveryMonths(rows);
    if (atStart) {
      // Cadastro NOVO: a lista ainda não tem comprimento conhecido e criar "no fim" estoura na UI5 ("Must know the
      // final length to create at the end"). Criar no início, do último mês para o primeiro, deixa janeiro no topo.
      for (const month of [...missing].reverse()) binding.create(defaultCommodityMonth(month), false, false, false);
      return;
    }
    for (const month of missing) binding.create(defaultCommodityMonth(month), false, true, false);
  }

  onAddItem(): void {
    this.itemsBinding().create({ ItemCode: "", ItemName: "" }, false, true, false);
  }

  onRemoveItem(): void {
    const context = this.getSelectRowContext(this.itemsTable());
    if (!context) {
      MessageBox.alert(this.text("marketCommodityItemSelectToRemove"));
      return;
    }
    const model = this.getView().getModel() as ODataModel;
    void context.delete(model.getUpdateGroupId()).catch((): void => undefined);
  }

  /** Value help do produto na linha: código + nome copiados (mesmo diálogo da tabela de preços). */
  async onPickItem(ev: Button$PressEvent): Promise<void> {
    const row = ev.getSource().getBindingContext() as Context;
    if (!row) return;
    const picked = await DialogHelper.openTableSelectDialog(this, "ItemsSelectDialog", ["ItemCode", "ItemName"]);
    if (!picked) return;
    void row.setProperty("ItemCode", picked.getProperty("ItemCode"));
    void row.setProperty("ItemName", picked.getProperty("ItemName"));
  }

  /**
   * Grava cabeçalho + produtos + meses num `$batch`. Só navega quando nada ficou pendente;
   * cadastro NOVO abre a edição do próprio cadastro.
   */
  protected async save(successKey: string): Promise<void> {
    if (!validateRequiredFields(this.byId("formMarketCommodity") as Form)) {
      MessageBox.warning(this.text("commonRequiredFields"));
      return;
    }
    const items = this.itemsBinding().getAllCurrentContexts().map((context) => context.getObject() as { ItemCode?: string });
    const months = this.monthsBinding().getAllCurrentContexts().map((context) => context.getObject() as CommodityMonthRow);
    const problem = commodityItemsProblem(items) ?? commodityMonthsProblem(months);
    if (problem) {
      MessageBox.warning(this.text(problem));
      return;
    }
    const model = this.getView().getModel() as ODataModel;
    const header = this.getView().getBindingContext() as Context;
    const wasTransient = header?.isTransient() === true;
    try {
      this.setBusy(true);
      await model.submitBatch(model.getUpdateGroupId());
    } catch {
      MessageBox.error(this.text("marketCommoditySaveFailed"));
      return;
    } finally {
      this.setBusy(false);
    }
    if (model.hasPendingChanges(model.getUpdateGroupId())) return;

    MessageToast.show(this.text(successKey), { closeOnBrowserNavigation: false });
    const code = wasTransient ? String(header.getProperty("Code") ?? "") : "";
    if (code) this.navTo("marketCommoditiesEdit", { code }, true);
    else this.navTo("marketCommodities", {}, true);
  }

  onCancel(): void {
    this.discardChanges();
    this.onNavBack();
  }
}
