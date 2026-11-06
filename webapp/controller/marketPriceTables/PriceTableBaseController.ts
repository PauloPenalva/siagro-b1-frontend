import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Select$ChangeEvent } from "sap/m/Select";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Message from "sap/ui/core/message/Message";
import Table from "sap/ui/table/Table";
import Form from "sap/ui/layout/form/Form";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import Messaging from "sap/ui/core/Messaging";
import MessageType from "sap/ui/core/message/MessageType";
import { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
import BaseController from "../BaseController";
import DialogHelper from "siagrob1/dialogs/DialogHelper";
import { clearFieldStates, validateRequiredFields } from "siagrob1/helpers/FormValidation";
import { EMPTY_LOOKUPS, loadMarketLookups } from "siagrob1/helpers/MarketLookups";
import {
  curveRequired, MARKET_MANAGE, nextSortOrder, priceLineError, quoteUnitOf
} from "siagrob1/helpers/MarketPricingHelpers";
import SessionService from "siagrob1/services/SessionService";
import { MarketInstrument } from "siagrob1/types/MarketInstrument";
import { MarketPriceTableLine } from "siagrob1/types/MarketPricing";

/**
 * Base das telas de inclusão/alteração da tabela de preços: cabeçalho OData deferido + linhas na
 * navegação `Lines`, gravados juntos num único `$batch` (mesmo molde da tabela de custos).
 *
 * @namespace siagrob1.controller.marketPriceTables
 */
export default class PriceTableBaseController extends BaseController {
  protected bundle?: ResourceBundle;
  private ownRoute?: string;
  /** Sobe a cada saída da rota: carga assíncrona de uma visita que já acabou não pode mexer no model. */
  protected leaveSeq = 0;

  /**
   * O `UpdateGroup` é do app inteiro: sair da tela com edição pendente (menu, voltar do navegador) deixaria
   * cabeçalho transitório, linhas e PATCHes para o próximo `submitBatch` de QUALQUER tela. Ao ir para outra
   * rota, descarta tudo.
   */
  protected watchLeave(ownRoute: string): void {
    this.ownRoute = ownRoute;
    this.getRouter().attachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  onExit(): void {
    this.getRouter().detachBeforeRouteMatched(this.onBeforeRouteMatched, this);
  }

  private readonly onBeforeRouteMatched = (ev: Router$BeforeRouteMatchedEvent): void => {
    if (ev.getParameter("name") === this.ownRoute) return;
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

  protected initModels(): void {
    this.getView().setModel(new JSONModel({ canManage: false }), "view");
    this.getView().setModel(new JSONModel({ ...EMPTY_LOOKUPS }), "lookup");
  }

  /** Prepara a tela: permissão, textos, listas de apoio (antes de ligar o formulário) e limpa pendências. */
  protected async prepare(): Promise<void> {
    (this.getView().getModel("view") as JSONModel).setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    clearFieldStates(this.byId("formMarketPriceTable") as Form);
    const model = this.getView().getModel() as ODataModel;
    if (model.hasPendingChanges(model.getUpdateGroupId())) model.resetChanges(model.getUpdateGroupId());
    (this.getView().getModel("lookup") as JSONModel).setData(await loadMarketLookups(model));
  }

  protected text(key: string, args?: string[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  protected lookups(): MarketInstrument[] {
    return (this.getView().getModel("lookup") as JSONModel).getProperty("/instruments") as MarketInstrument[];
  }

  private linesTable(): Table {
    return this.byId("tablePriceLines") as Table;
  }

  private linesBinding(): ODataListBinding {
    return this.linesTable().getBinding("rows") as ODataListBinding;
  }

  /** Formatter do Select de curva (`this` = controller): só habilita para cotação em US$. */
  curveEnabled(instrumentCode: string, instruments: MarketInstrument[], canManage: boolean): boolean {
    return canManage === true && curveRequired(quoteUnitOf(instrumentCode, instruments));
  }

  /** Trocou o instrumento: a curva deixa de valer se a cotação não for em US$. */
  onInstrumentChange(ev: Select$ChangeEvent): void {
    const select = ev.getSource();
    const context = select.getBindingContext() as Context;
    if (context && !curveRequired(quoteUnitOf(select.getSelectedKey(), this.lookups()))) {
      void context.setProperty("FxCurveInstrumentCode", null);
    }
  }

  async onPickItem(): Promise<void> {
    const picked = await DialogHelper.openTableSelectDialog(this, "ItemsSelectDialog", ["ItemCode", "ItemName"]);
    if (!picked) return;
    // Código + nome copiado (sem FK): ambos vão no mesmo envio.
    const header = this.getView().getBindingContext() as Context;
    void header.setProperty("ItemCode", picked.getProperty("ItemCode"));
    void header.setProperty("ItemName", picked.getProperty("ItemName"));
  }

  async onPickHarvestSeason(): Promise<void> {
    const picked = await DialogHelper.openTableSelectDialog(this, "HarvestSeasonsSelectDialog", ["Code", "Name"]);
    if (picked) void (this.getView().getBindingContext() as Context).setProperty("HarvestSeasonCode", picked.getProperty("Code"));
  }

  onAddLine(): void {
    const binding = this.linesBinding();
    const existing = binding.getAllCurrentContexts().map((context) => context.getObject() as MarketPriceTableLine);
    const line: MarketPriceTableLine = {
      Description: "", InstrumentCode: "", FxCurveInstrumentCode: null,
      Premium: 0, ElevationCost: 0, FxDiscount: 0, DiscountValue: 0, DiscountIsPercent: true,
      MarginPercent: 0, DailyInterestPercent: 0, TechnicalLossPercent: 0, RuralTaxPercent: 0,
      FreightCoefficientPercent: 0, SortOrder: nextSortOrder(existing), Active: true,
    };
    binding.create(line, false, true, false);
  }

  onRemoveLine(): void {
    const context = this.getSelectRowContext(this.linesTable());
    if (!context) {
      MessageBox.alert(this.text("marketLineSelectToRemove"));
      return;
    }
    const model = this.getView().getModel() as ODataModel;
    void context.delete(model.getUpdateGroupId()).catch((): void => undefined);
  }

  /** Confere as linhas; devolve a mensagem do primeiro problema ou `null`. */
  private linesProblem(): string {
    const contexts = this.linesBinding().getAllCurrentContexts();
    if (!contexts.length) return this.text("marketLinesRequired");
    const instruments = this.lookups();
    for (let index = 0; index < contexts.length; index++) {
      const key = priceLineError(contexts[index].getObject() as MarketPriceTableLine, instruments);
      if (key) return this.text("marketLineErrorAt", [String(index + 1), this.text(key)]);
    }
    return null;
  }

  /** Mensagens de erro do servidor sobre tabelas de preços ainda ativas (rejeição de campo/linha). */
  private hasServerErrors(): boolean {
    return (Messaging.getMessageModel().getData() as Message[]).some((message) =>
      message.getType() === MessageType.Error && message.getTargets().some((target) => target.includes("MarketPriceTable")));
  }

  /**
   * Grava cabeçalho + linhas num `$batch`. Só navega quando nada ficou pendente nem há erro do servidor;
   * tabela NOVA abre a edição da própria tabela (em vez de depender dos contextos aninhados da resposta).
   */
  protected async save(successKey: string): Promise<void> {
    if (!validateRequiredFields(this.byId("formMarketPriceTable") as Form)) {
      MessageBox.warning(this.text("commonRequiredFields"));
      return;
    }
    const problem = this.linesProblem();
    if (problem) {
      MessageBox.warning(problem);
      return;
    }
    const model = this.getView().getModel() as ODataModel;
    const header = this.getView().getBindingContext() as Context;
    const wasTransient = header?.isTransient() === true;
    try {
      this.setBusy(true);
      await model.submitBatch(model.getUpdateGroupId());
    } catch {
      // Falha de rede/servidor: o grupo mantém as pendências e o usuário segue na página para tentar de novo.
      MessageBox.error(this.text("marketPriceTableSaveFailed"));
      return;
    } finally {
      this.setBusy(false);
    }
    if (model.hasPendingChanges(model.getUpdateGroupId()) || this.hasServerErrors()) return;

    MessageToast.show(this.text(successKey), { closeOnBrowserNavigation: false });
    const id = wasTransient ? String(header.getProperty("Id")) : "";
    if (/^\d+$/.test(id)) this.navTo("marketPriceTablesEdit", { id }, true);
    else this.navTo("marketPriceTables", {}, true);
  }

  onCancel(): void {
    this.discardChanges();
    this.onNavBack();
  }
}
