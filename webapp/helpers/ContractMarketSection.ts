import { InputBase$ChangeEvent } from "sap/m/InputBase";
import { Select$ChangeEvent } from "sap/m/Select";
import Fragment from "sap/ui/core/Fragment";
import View from "sap/ui/core/mvc/View";
import Router, { Router$BeforeRouteMatchedEvent } from "sap/ui/core/routing/Router";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import Context from "sap/ui/model/odata/v4/Context";
import ResourceModel from "sap/ui/model/resource/ResourceModel";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import ObjectPageLayout from "sap/uxap/ObjectPageLayout";
import ObjectPageSection from "sap/uxap/ObjectPageSection";
import { loadMarketLookups } from "siagrob1/helpers/MarketLookups";
import { MARKET_MANAGE, numberErrorKey, parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import { usdPerBagToKg, usdPerKgToBag } from "siagrob1/helpers/MarketSetupHelpers";
import {
  buildContractMarketDataPayload, ContractMarketDataForm, ContractMarketDataInitial, contractMarketDataInitial, formatFixedDecimal,
  instrumentOptionsFor, PRICE_DECIMALS, RATE_DECIMALS, roundToDecimals
} from "siagrob1/helpers/ContractMarketDataHelpers";
import { marketFetch, MarketResult, notFoundTextKey } from "siagrob1/helpers/MarketHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import MarketModuleService from "siagrob1/services/MarketModuleService";
import SessionService from "siagrob1/services/SessionService";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import Select from "sap/m/Select";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";

type InstrumentOption = { Code: string; Label: string };

/** Campo do diálogo "Alterar dados de mercado" → id do Input (para marcar o erro de validação). */
const DIALOG_INPUTS: Record<string, string> = {
  exchangePrice: "contractMarketDataExchangePrice",
  premium: "contractMarketDataPremium",
  usdPerBag: "contractMarketDataUsdPerBag",
  fxRate: "contractMarketDataFxRate",
};

/** Input do fragmento → propriedade do contrato; `perBag` = mostrado por saca, gravado por kg. */
const NUMBER_FIELDS: Record<string, { property: string; perBag: boolean }> = {
  contractMarketExchangePrice: { property: "MarketExchangePrice", perBag: false },
  contractMarketPremium: { property: "MarketPremium", perBag: false },
  contractMarketUsdPrice: { property: "MarketUsdPrice", perBag: true },
  contractMarketFxRate: { property: "MarketFxRate", perBag: false },
};

/**
 * Seção "Mercado" das telas de contrato (compra e venda, formulário e detalhe). Cada tela cria uma
 * instância no `onInit` e chama o handler da rota por `whenReady()`:
 *
 * - módulo desligado: só a sonda única e guardada de `/market/module`; nada é inserido, nenhum campo
 *   novo entra em `$select` nem em payload — a tela fica exatamente como era;
 * - módulo ligado: carrega os instrumentos (antes do fragmento: Select com itens tardios renderiza
 *   vazio) e insere a seção logo depois de "Dados do Contrato". Como a seção entra antes do
 *   `bindElement`, os seis campos vão no `$select` automático do próprio contrato (sem late property).
 *
 * É também o controlador do fragmento (formatters e o `change` dos números).
 */
export default class ContractMarketSection {
  private readonly view: View;
  private ready?: Promise<void>;
  /** Seção já resolvida de vez (resposta definitiva do módulo + seção inserida ou dispensada). */
  private settled = false;
  /** Sobe a cada visita da própria rota e a cada saída dela: espera antiga não chama o handler. */
  private seq = 0;
  private bundle?: ResourceBundle;
  /** Lado do contrato no PUT market-data (pela rota da tela). */
  private readonly side: "purchase" | "sales";
  /** Tela de detalhe: só nela aparece "Alterar dados de mercado". */
  private readonly detail: boolean;
  private dataDialog?: Dialog;
  /** Trava do clique até o fim do PUT: clique duplo não manda dois pedidos. */
  private saving = false;
  /** Instrumentos ativos (com a linha vazia); a lista do Select = estes + o código do contrato mostrado. */
  private activeInstruments: InstrumentOption[] = [];
  /** Texto inicial e números originais do diálogo aberto (campo não tocado volta exato no PUT). */
  private dataInitial?: ContractMarketDataInitial;

  constructor(view: View, router: Router, ownRoute: string) {
    this.view = view;
    this.side = ownRoute.startsWith("purchase") ? "purchase" : "sales";
    this.detail = ownRoute.endsWith("Detail");
    router.attachBeforeRouteMatched((ev: Router$BeforeRouteMatchedEvent) => {
      if (ev.getParameter("name") !== ownRoute) this.seq++;
    });
  }

  /**
   * Roda o handler da rota. Com a seção já resolvida, roda NA HORA (mesmo tick do evento de rota,
   * como antes do módulo existir); só a primeira visita espera a sonda/seção, e o handler é
   * descartado se, nesse meio-tempo, o usuário saiu da rota ou voltou a ela.
   */
  whenReady(handler: () => void): void {
    const seq = ++this.seq;
    if (this.settled) {
      handler();
      return;
    }
    void this.ensure().then(() => {
      if (seq === this.seq) handler();
    });
  }

  /** Insere a seção uma vez por view (só com o módulo ligado). Nunca rejeita. */
  private ensure(): Promise<void> {
    return (this.ready ??= this.load().then((settled) => {
      this.settled = settled;
      // Sonda sem resposta definitiva (tempo esgotado/rede): a próxima visita tenta de novo.
      if (!settled) this.ready = undefined;
    }, (error: unknown) => {
      console.warn("Seção Mercado do contrato não carregada.", error);
      this.settled = true;
    }));
  }

  /** Devolve `true` quando o resultado é definitivo para a sessão. */
  private async load(): Promise<boolean> {
    const enabled = await MarketModuleService.isEnabled();
    if (!enabled) return MarketModuleService.knownState() === false;

    const layout = this.view.getContent().find((control) => control.isA("sap.uxap.ObjectPageLayout")) as ObjectPageLayout;
    if (!layout) return true;

    const model = this.view.getModel() as ODataModel;
    let instruments: InstrumentOption[] = [];
    try {
      const lookups = await loadMarketLookups(model, true, false);
      instruments = lookups.priceInstruments.map((i) => ({ Code: i.Code, Label: i.Description ? `${i.Code} - ${i.Description}` : i.Code }));
    } catch {
      // sem instrumentos o Select fica vazio; o resto da seção continua utilizável
    }
    // Primeira linha vazia: "sem instrumento de referência".
    this.activeInstruments = [{ Code: "", Label: "" }, ...instruments];
    this.view.setModel(new JSONModel({
      instruments: this.activeInstruments,
      detail: this.detail,
      canManage: this.detail && SessionService.hasPermission(MARKET_MANAGE),
    }), "marketSection");

    const resourceModel = this.view.getModel("i18n") as ResourceModel;
    this.bundle = (await resourceModel?.getResourceBundle());

    const section = await Fragment.load({
      id: this.view.getId(),
      name: "siagrob1.view.fragments.market.ContractMarketSection",
      controller: this,
    }) as ObjectPageSection;
    layout.insertSection(section, 1);
    // Lista do Select montada por contrato (fora do formatter): a cada valor/contrato novo, ativos + o código atual.
    const instrumentSelect = this.view.byId("contractMarketInstrument") as Select;
    instrumentSelect?.getBinding("selectedKey")?.attachChange(
      () => this.applyInstrumentOptions(instrumentSelect.getBindingContext()?.getProperty("MarketInstrumentCode")));
    // O contrato pode já estar carregado quando a seção entra: o primeiro "change" teria passado antes do listener.
    this.applyInstrumentOptions(instrumentSelect?.getBindingContext()?.getProperty("MarketInstrumentCode"));
    return true;
  }

  private text(key: string): string {
    return this.bundle?.getText(key) ?? key;
  }

  /** Números como o usuário digita (pt-BR, sem milhar, casas fixas): reler nunca é ambíguo. */
  formatPrice = (value: unknown): string => formatFixedDecimal(value, PRICE_DECIMALS);

  formatRate = (value: unknown): string => formatFixedDecimal(value, RATE_DECIMALS);

  formatUsdPerBag = (perKg: unknown): string => formatFixedDecimal(usdPerKgToBag(perKg), RATE_DECIMALS);

  /**
   * O Select é só de leitura (formatter): ligação de mão dupla escreveria "" de volta ao renderizar um
   * contrato sem instrumento e geraria PATCH sem o usuário mexer. A troca grava pelo `change`.
   */
  instrumentKey = (code: unknown): string => (typeof code === "string" ? code : "");

  /** Instrumento hoje inativo do contrato mostrado entra na lista (só dele: a lista é refeita a cada contrato). */
  private applyInstrumentOptions(code: unknown): void {
    const model = this.view.getModel("marketSection") as JSONModel;
    const next = instrumentOptionsFor(this.activeInstruments, code);
    if (model && model.getProperty("/instruments") !== next) model.setProperty("/instruments", next);
  }

  onInstrumentChange = (ev: Select$ChangeEvent): void => {
    const select = ev.getSource();
    const context = select.getBindingContext() as Context;
    if (!context) return;
    this.setIfChanged(context, "MarketInstrumentCode", select.getSelectedKey() || null);
  };

  /** Só grava quando muda de fato: reescrever o mesmo valor deixaria um PATCH pendente à toa. */
  private setIfChanged(context: Context, property: string, value: string | number): void {
    const current = context.getProperty(property) as unknown;
    const same = (current === null || current === undefined || current === "")
      ? value === null
      : typeof value === "number" ? Number(current) === value : current === value;
    if (!same) void context.setProperty(property, value).catch((): void => undefined);
  }

  /** Ao sair do campo: valida com `parseStrictDecimal` e grava no contrato (vazio = nulo). */
  onNumberChange = (ev: InputBase$ChangeEvent): void => {
    const input = ev.getSource();
    const localId = this.view.getLocalId(input.getId()) ?? input.getId();
    const field = NUMBER_FIELDS[localId];
    const context = input.getBindingContext() as Context;
    if (!field || !context) return;

    const { value, error } = parseStrictDecimal(input.getValue());
    if (error) {
      input.setValueState("Error");
      input.setValueStateText(this.text(numberErrorKey(error)));
      return;
    }
    input.setValueState("None");
    // Arredonda para as casas mostradas ANTES de gravar: a tela nunca guarda mais precisão do que mostra.
    const decimals = field.perBag || field.property === "MarketFxRate" ? RATE_DECIMALS : PRICE_DECIMALS;
    const rounded = roundToDecimals(value, decimals);
    const stored = field.perBag ? usdPerBagToKg(rounded) : rounded;
    this.setIfChanged(context, field.property, stored);
    // Reescreve o texto como foi entendido (o binding é só de leitura por causa do formatter).
    input.setValue(field.perBag ? this.formatUsdPerBag(stored)
      : field.property === "MarketFxRate" ? this.formatRate(stored) : this.formatPrice(stored));
  };

  // ---- "Alterar dados de mercado" (contrato aprovado; só no detalhe) ----

  private dataModel(): JSONModel {
    return this.view.getModel("marketData") as JSONModel;
  }

  /** Abre o diálogo com os cinco campos do contrato mostrado. */
  onEditMarketData = async (): Promise<void> => {
    const context = this.view.getBindingContext() as Context;
    if (!context || this.saving) return;
    // Instrumento inativo entra na lista (mesma regra do Select da seção).
    this.applyInstrumentOptions(context.getProperty("MarketInstrumentCode"));
    this.dataInitial = contractMarketDataInitial((context.getObject() ?? {}) as Record<string, unknown>);
    if (!this.view.getModel("marketData")) this.view.setModel(new JSONModel(), "marketData");
    this.dataModel().setData({ ...this.dataInitial.form, busy: false });
    if (!this.dataDialog) {
      this.dataDialog = await Fragment.load({
        id: this.view.getId(),
        name: "siagrob1.view.fragments.market.ContractMarketDataDialog",
        controller: this,
      }) as Dialog;
      this.view.addDependent(this.dataDialog);
    }
    this.dataDialog.open();
  };

  /** Ao sair do campo do diálogo: valida e reescreve com casas fixas. */
  private reformat(ev: InputBase$ChangeEvent, decimals: number): void {
    const input = ev.getSource();
    const { value, error } = parseStrictDecimal(input.getValue());
    if (error) {
      input.setValueState("Error");
      input.setValueStateText(this.text(numberErrorKey(error)));
      return;
    }
    input.setValueState("None");
    input.setValue(formatFixedDecimal(value, decimals));
  }

  onMarketDataPriceChange = (ev: InputBase$ChangeEvent): void => this.reformat(ev, PRICE_DECIMALS);

  onMarketDataRateChange = (ev: InputBase$ChangeEvent): void => this.reformat(ev, RATE_DECIMALS);

  onCancelMarketData = (): void => {
    if (!this.saving) this.dataDialog?.close();
  };

  /** Limpa erros deixados nos campos para a próxima abertura. */
  onMarketDataDialogClosed = (): void => {
    for (const control of this.dataDialog?.findAggregatedObjects(true, (c) => c.isA("sap.m.Input")) ?? []) {
      (control as Input).setValueState("None");
    }
  };

  /** PUT market-data (nunca pelo modelo OData: nada fica pendente no update group). */
  onSaveMarketData = async (): Promise<void> => {
    const context = this.view.getBindingContext() as Context;
    const key = /\(([^)]+)\)$/.exec(context?.getPath() ?? "")?.[1];
    if (!key || this.saving) return;
    const { payload, field, error } = buildContractMarketDataPayload(this.dataModel().getData() as ContractMarketDataForm, this.dataInitial);
    if (!payload) {
      const message = this.text(error === "notPositive" ? "marketContractDataNotPositive" : numberErrorKey(error));
      // Marca o campo recusado; o `change` do campo limpa quando o valor fica válido.
      const input = field ? this.view.byId(DIALOG_INPUTS[field]) as Input : undefined;
      input?.setValueState("Error");
      input?.setValueStateText(message);
      MessageBox.warning(message);
      return;
    }
    this.saving = true;
    this.dataModel().setProperty("/busy", true);
    let result: MarketResult;
    try {
      result = await marketFetch("PUT", ServerRoutes.marketContractMarketData(this.side, decodeURIComponent(key)), payload);
    } finally {
      this.saving = false;
      this.dataModel().setProperty("/busy", false);
    }
    if (!result.ok) {
      // Erro do servidor (text/plain pt-BR) exatamente como veio.
      if (result.status === 404 && result.moduleDisabled) MessageBox.warning(this.text(notFoundTextKey(true)));
      else MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
      return;
    }
    this.dataDialog?.close();
    MessageToast.show(this.text("marketContractDataSaved"));
    // Recarrega o contrato mostrado: a seção e o log de alterações refletem a mudança.
    this.reloadContract(context);
  };

  /** `refresh` lança com pendência no update group: tenta recarregar só o contrato; senão, avisa. */
  private reloadContract(context: Context): void {
    try {
      context.refresh();
      return;
    } catch (error) {
      console.warn("Contrato não recarregado por refresh.", error);
    }
    const warn = (error: unknown): void => {
      console.warn("Contrato não recarregado por requestSideEffects.", error);
      MessageBox.information(this.text("marketContractDataReopen"));
    };
    try {
      context.requestSideEffects([{ $PropertyPath: "*" }]).catch(warn);
    } catch (error) {
      warn(error);
    }
  }
}
