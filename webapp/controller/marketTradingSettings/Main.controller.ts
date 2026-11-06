import MessageBox from "sap/m/MessageBox";
import Input from "sap/m/Input";
import { InputBase$ChangeEvent } from "sap/m/InputBase";
import MessageToast from "sap/m/MessageToast";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import CommonController from "../common/CommonController";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { marketFetch, MarketResult, notFoundTextKey } from "siagrob1/helpers/MarketHelpers";
import { EMPTY_LOOKUPS, loadMarketLookups } from "siagrob1/helpers/MarketLookups";
import {
  buildTradingSettingsPayload, formatStrictDecimal, MARKET_BOARD_APPROVE, MARKET_MANAGE, numberErrorKey,
  parseStrictDecimal, tradingSettingsToForm
} from "siagrob1/helpers/MarketPricingHelpers";
import { MarketTradingSettings, MarketTradingSettingsForm } from "siagrob1/types/MarketPricing";

/**
 * Parâmetros do Mercado (REST GET/PUT `/market/trading-settings`): dólar à vista, limiares de alçada
 * e unidades do contrato gerado pela boleta. Gravar exige `MARKET_MANAGE`; mexer nos limiares
 * exige também `MARKET_BOARD_APPROVE`. O servidor decide; aqui os campos só ficam travados.
 *
 * @namespace siagrob1.controller.marketTradingSettings
 */
export default class Main extends CommonController {
  private bundle?: ResourceBundle;

  onInit(): void {
    this.getView().setModel(new JSONModel({}), "form");
    this.getView().setModel(new JSONModel({ ...EMPTY_LOOKUPS }), "lookup");
    this.getRouter().getRoute("marketTradingSettings").attachPatternMatched(() => void this.load());
  }

  private model(): JSONModel {
    return this.getView().getModel("form") as JSONModel;
  }

  private text(key: string): string {
    return this.bundle?.getText(key) ?? key;
  }

  private show(settings?: Partial<MarketTradingSettings>, moduleDisabled = false, moduleMessage = ""): void {
    const canManage = SessionService.hasPermission(MARKET_MANAGE);
    this.model().setData({
      ...tradingSettingsToForm(settings),
      canManage,
      canBoard: canManage && SessionService.hasPermission(MARKET_BOARD_APPROVE),
      moduleDisabled,
      moduleMessage,
    });
  }

  private async load(): Promise<void> {
    this.bundle ??= await this.getResourceBundle();
    this.show();
    this.setBusy(true);
    try {
      // Lista do Select antes do valor: selectedKey sem itens renderiza vazio.
      (this.getView().getModel("lookup") as JSONModel).setData(
        await loadMarketLookups(this.getView().getModel() as ODataModel, true, false));
      const result = await marketFetch<MarketTradingSettings>("GET", ServerRoutes.marketTradingSettings);
      if (!result.ok) {
        if (result.status === 404) {
          this.show(undefined, true, this.text(notFoundTextKey(result.moduleDisabled)));
          return;
        }
        this.showError(result);
        return;
      }
      this.show(result.data);
    } finally {
      this.setBusy(false);
    }
  }

  private markNumber(field: string, error?: "invalid" | "ambiguous"): void {
    const input = this.byId(field) as Input;
    input.setValueState(error ? "Error" : "None");
    if (error) input.setValueStateText(this.text(numberErrorKey(error)));
  }

  /** Ao sair do campo: mostra o erro ou reescreve o valor como foi entendido. */
  onNumberChange(ev: InputBase$ChangeEvent): void {
    const input = ev.getSource();
    const { value, error } = parseStrictDecimal(input.getValue());
    this.markNumber(input.getId().split("--").pop(), error ?? (value !== null && value < 0 ? "invalid" : undefined));
    if (!error && value !== null) input.setValue(formatStrictDecimal(value));
  }

  async onSave(): Promise<void> {
    const { payload, errors } = buildTradingSettingsPayload(this.model().getData() as MarketTradingSettingsForm);
    this.markNumber("boardApprovalVolumeTons", errors.boardApprovalVolumeTons);
    this.markNumber("boardApprovalDeviationPercent", errors.boardApprovalDeviationPercent);
    if (!payload) {
      MessageBox.warning(this.text("marketTradingInvalid"));
      return;
    }
    this.setBusy(true);
    try {
      const result = await marketFetch<MarketTradingSettings>("PUT", ServerRoutes.marketTradingSettings, payload);
      if (!result.ok) {
        // 400/403 trazem o texto pt-BR do servidor.
        this.showError(result);
        return;
      }
      if (result.data) this.show(result.data);
      MessageToast.show(this.text("marketTradingSaved"));
    } finally {
      this.setBusy(false);
    }
  }

  private showError(result: MarketResult): void {
    if (result.status === 404) {
      MessageBox.warning(this.text(notFoundTextKey(result.moduleDisabled)));
      return;
    }
    MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }
}
