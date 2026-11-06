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
  buildContractMarketDataPayload, ContractMarketDataForm, contractMarketDataToForm, formatFixedDecimal, PRICE_DECIMALS, RATE_DECIMALS
} from "siagrob1/helpers/ContractMarketDataHelpers";
import { marketFetch, MarketResult, notFoundTextKey } from "siagrob1/helpers/MarketHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import MarketModuleService from "siagrob1/services/MarketModuleService";
import SessionService from "siagrob1/services/SessionService";
import Dialog from "sap/m/Dialog";
import Input from "sap/m/Input";
import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";

type InstrumentOption = { Code: string; Label: string };

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
    this.view.setModel(new JSONModel({
      instruments: [{ Code: "", Label: "" }, ...instruments],
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
  instrumentKey = (code: unknown): string => {
    if (typeof code !== "string" || !code) return "";
    // Instrumento hoje inativo (fora da lista de ativos): entra na lista para o Select não ficar vazio.
    const model = this.view.getModel("marketSection") as JSONModel;
    const list = (model?.getProperty("/instruments") as InstrumentOption[]) ?? [];
    if (model && !list.some((option) => option.Code === code)) {
      model.setProperty("/instruments", [...list, { Code: code, Label: code }]);
    }
    return code;
  };

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
    const stored = field.perBag ? usdPerBagToKg(value) : value;
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
    this.instrumentKey(context.getProperty("MarketInstrumentCode"));
    const form = contractMarketDataToForm((context.getObject() ?? {}) as Record<string, unknown>);
    if (!this.view.getModel("marketData")) this.view.setModel(new JSONModel(), "marketData");
    this.dataModel().setData({ ...form, busy: false });
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
    const { payload, error } = buildContractMarketDataPayload(this.dataModel().getData() as ContractMarketDataForm);
    if (!payload) {
      MessageBox.warning(this.text(error === "notPositive" ? "marketContractDataNotPositive" : numberErrorKey(error)));
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
    context.refresh();
  };
}
