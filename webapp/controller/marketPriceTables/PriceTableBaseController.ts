import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import { Select$ChangeEvent } from "sap/m/Select";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import Form from "sap/ui/layout/form/Form";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
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
  curveEnabled(instrumentCode: string, instruments: MarketInstrument[]): boolean {
    return curveRequired(quoteUnitOf(instrumentCode, instruments));
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
    try {
      this.setBusy(true);
      await model.submitBatch(model.getUpdateGroupId());
      if (!model.hasPendingChanges(model.getUpdateGroupId())) {
        MessageToast.show(this.text(successKey), { closeOnBrowserNavigation: false });
        this.navTo("marketPriceTables", {}, true);
      }
    } finally {
      this.setBusy(false);
    }
  }

  onCancel(): void {
    const model = this.getView().getModel() as ODataModel;
    if (model.hasPendingChanges(model.getUpdateGroupId())) model.resetChanges(model.getUpdateGroupId());
    this.onNavBack();
  }
}
