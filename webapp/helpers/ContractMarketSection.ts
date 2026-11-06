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
import { formatStrictDecimal, numberErrorKey, parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import { usdPerBagToKg, usdPerKgToBag } from "siagrob1/helpers/MarketSetupHelpers";
import MarketModuleService from "siagrob1/services/MarketModuleService";

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

  constructor(view: View, router: Router, ownRoute: string) {
    this.view = view;
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
    this.view.setModel(new JSONModel({ instruments: [{ Code: "", Label: "" }, ...instruments] }), "marketSection");

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

  /** Número como o usuário digita (pt-BR, sem milhar): reler nunca é ambíguo. */
  formatNumber = (value: unknown): string =>
    value === null || value === undefined || value === "" ? "" : formatStrictDecimal(Number(value));

  formatUsdPerBag = (perKg: unknown): string => {
    const perBag = usdPerKgToBag(perKg);
    return perBag === null ? "" : formatStrictDecimal(perBag);
  };

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
    input.setValue(field.perBag ? this.formatUsdPerBag(stored) : this.formatNumber(stored));
  };
}
