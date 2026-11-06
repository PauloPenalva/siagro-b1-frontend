import MessageBox from "sap/m/MessageBox";
import MessageToast from "sap/m/MessageToast";
import Dialog from "sap/m/Dialog";
import { Input$LiveChangeEvent } from "sap/m/Input";
import TableSelectDialog, {
  TableSelectDialog$ConfirmEvent, TableSelectDialog$SearchEvent
} from "sap/m/TableSelectDialog";
import Sorter from "sap/ui/model/Sorter";
import JSONModel from "sap/ui/model/json/JSONModel";
import ODataModel from "sap/ui/model/odata/v4/ODataModel";
import ODataListBinding from "sap/ui/model/odata/v4/ODataListBinding";
import Context from "sap/ui/model/odata/v4/Context";
import Table from "sap/ui/table/Table";
import ResourceBundle from "sap/base/i18n/ResourceBundle";
import BaseController from "../BaseController";
import { confirmDialog } from "siagrob1/helpers/DialogHelpers";
import { localIsoDate } from "siagrob1/helpers/DateHelpers";
import { EMPTY_VALUE, MarketResult, marketFetch, notFoundTextKey } from "siagrob1/helpers/MarketHelpers";
import { formatTons, lotEquivalent, parseLots, sideTextKey } from "siagrob1/helpers/MarketHedgeHelpers";
import {
  EfpField, EfpForm, EfpFormErrors, buildEfpPayload, contractRouteName, currencySymbol, defaultFuturesSide, efpActions, efpInputSignature, efpStatusTextKey, invalidatesPreview,
  exceedsAvailable, formatBagPrice, formatBags, formatPerKg, fxMode, tonsMismatch
} from "siagrob1/helpers/MarketEfpHelpers";
import { loadCounterparties, loadMarketLookups } from "siagrob1/helpers/MarketLookups";
import { accountOptions, toIsoDate } from "siagrob1/helpers/MarketHedgeHelpers";
import { MARKET_MANAGE, parseStrictDecimal } from "siagrob1/helpers/MarketPricingHelpers";
import ServerRoutes from "siagrob1/model/ServerRoutes";
import SessionService from "siagrob1/services/SessionService";
import { MarketEfp, MarketEfpContract, MarketEfpPreview, MarketLotInfo } from "siagrob1/types/MarketHedges";

/** Id do controle do diálogo que carrega o estado de erro de cada campo. */
const FIELD_CONTROL: Record<EfpField, string> = {
  contractKey: "efpContract", bags: "efpBags", accountId: "efpAccount", instrumentCode: "efpInstrument", side: "efpSide",
  lots: "efpLots", price: "efpPrice", premium: "efpPremium", fxRate: "efpFx", financialDueDate: "efpDue", date: "efpDate",
};

type Markable = { setValueState(state: "None" | "Error"): unknown; setValueStateText(text: string): unknown };

/** Estado do diálogo: `EfpForm` + o que a tela mostra e o que se sabe do contrato escolhido. */
type EfpDialogModel = EfpForm & {
  accounts: { id: string; label: string }[];
  contractCode: string;
  contractCurrency: string;
  availableKg: number;
  availableText: string;
  contractInfo: string;
  bagsInfo: string;
  lotsInfo: string;
  fxEnabled: boolean;
  fxRefused: boolean;
  fxInfo: string;
  mismatch: boolean;
  previewVisible: boolean;
  previewPerBag: string;
  previewPerKg: string;
  previewTonsFutures: string;
  previewTonsPhysical: string;
};

const BLANK_PREVIEW = {
  mismatch: false, previewVisible: false, previewPerBag: "", previewPerKg: "", previewTonsFutures: "", previewTonsPhysical: "",
};

/**
 * EFP (troca de futuro por físico): lista OData `MarketEfps` (só leitura; gravação por REST). O EFP fixa o preço
 * de um contrato a fixar e registra a perna de bolsa; o servidor decide e garante a idempotência.
 *
 * @namespace siagrob1.controller.marketEfps
 */
export default class Main extends BaseController {
  private bundle?: ResourceBundle;
  private efpDialog?: Dialog;
  private contractDialog?: TableSelectDialog;
  private visited = false;
  /** Trava de ação em andamento: evita abrir duas confirmações ou gravar duas vezes com cliques seguidos. */
  private acting = false;
  private readonly lotInfoCache = new Map<string, MarketLotInfo>();
  private lotInfoSeq = 0;
  private contractsSeq = 0;

  /** Textos de enum (campos de instância, não getters: o UI5 resolve `.sideText` por nome). */
  sideText = (side: string): string => (side ? this.text(sideTextKey(side)) : "");
  statusText = (status: string): string => (status ? this.text(efpStatusTextKey(status)) : "");

  onInit(): void {
    this.getView().setModel(new JSONModel({ canManage: false }), "view");
    this.getView().setModel(new JSONModel({ futures: [] }), "lookup");
    this.getView().setModel(new JSONModel(this.noSelection()), "sel");
    const efp = new JSONModel({});
    // Qualquer campo de entrada que mude (select, data, segmentado, texto) torna o resultado calculado velho.
    efp.attachPropertyChange((ev) => {
      if (invalidatesPreview(ev.getParameter("path"))) this.invalidatePreview();
    });
    this.getView().setModel(efp, "efp");
    this.getView().setModel(new JSONModel({ busy: false, rows: [] }), "contracts");
    this.getRouter().getRoute("marketEfps").attachPatternMatched(() => void this.routeMatched());
  }

  private noSelection() {
    return { ...efpActions(undefined, false), has: false };
  }

  private async routeMatched(): Promise<void> {
    this.viewModel().setProperty("/canManage", SessionService.hasPermission(MARKET_MANAGE));
    this.bundle ??= await this.getResourceBundle();
    const model = this.getView().getModel() as ODataModel;
    const [counterparties, lookups] = await Promise.all([loadCounterparties(model), loadMarketLookups(model, true, false)]);
    const lookup = this.getView().getModel("lookup") as JSONModel;
    lookup.setProperty("/accounts", accountOptions(counterparties, "Broker", true));
    // Dólar futuro (R$/US$) não tem commodity para fixar: fora do EFP.
    lookup.setProperty("/futures", lookups.instruments.filter(
      (instrument) => instrument.Type === "Future" && instrument.QuoteUnit !== "BrlPerUsd"
    ));

    const revisit = this.visited;
    this.visited = true;
    if (revisit) this.binding()?.refresh();
    else this.bindEfps();
  }

  private text(key: string, args?: string[]): string {
    return this.bundle?.getText(key, args) ?? key;
  }

  private viewModel(): JSONModel {
    return this.getView().getModel("view") as JSONModel;
  }

  private efpModel(): JSONModel {
    return this.getView().getModel("efp") as JSONModel;
  }

  private table(): Table {
    return this.byId("tableEfps") as Table;
  }

  private binding(): ODataListBinding {
    return this.table().getBinding("rows") as ODataListBinding;
  }

  /** As linhas só são ligadas com o bundle resolvido: `sideText`/`statusText` leem `this.bundle`. */
  private bindEfps(): void {
    this.table().bindRows({
      path: "/MarketEfps",
      parameters: {
        $select: "Id,Date,AccountId,InstrumentCode,Side,Lots,Price,Premium,FxRate,ContractSide,ContractKey,ContractCode,"
          + "VolumeKg,FixationPrice,FinancialDueDate,FuturesTradeId,Status,Notes",
        $expand: "Account($select=Code;$expand=Counterparty($select=Name)),Instrument($select=Code,QuoteUnit)",
      },
      sorter: [new Sorter("Id", true)],
    });
  }

  private showError(result: MarketResult): void {
    if (result.status === 404) {
      MessageBox.warning(this.text(notFoundTextKey(result.moduleDisabled === true)));
      return;
    }
    // 400/403 chegam em texto pt-BR do servidor: mostrados como recebidos.
    MessageBox.error(result.message || this.text(result.status === 0 ? "marketNoServer" : "marketGenericError"));
  }

  /** Roda uma ação por vez: um segundo clique durante a confirmação ou a gravação é ignorado. */
  private async exclusive(action: () => Promise<void>): Promise<void> {
    if (this.acting) return;
    this.acting = true;
    try {
      await action();
    } finally {
      this.acting = false;
    }
  }

  // -------------------------------------------------------------------------------------------
  // Lista: seleção e ações da linha
  // -------------------------------------------------------------------------------------------

  onRefresh(): void {
    this.binding()?.refresh();
  }

  private selectedContext(): Context {
    return this.getSelectRowContext(this.table());
  }

  private selectedEfp(): MarketEfp {
    return this.selectedContext()?.getObject() as MarketEfp;
  }

  /** Recalcula quais botões a linha selecionada aceita (chamado na seleção e a cada atualização das linhas). */
  onSelectionChange(): void {
    const efp = this.selectedEfp();
    const next = { ...efpActions(efp, this.viewModel().getProperty("/canManage") as boolean), has: !!efp };
    const sel = this.getView().getModel("sel") as JSONModel;
    if (JSON.stringify(sel.getData()) !== JSON.stringify(next)) sel.setData(next);
  }

  async onResume(): Promise<void> {
    await this.exclusive(async () => {
      const efp = this.selectedEfp();
      if (!efp) {
        MessageBox.alert(this.text("marketEfpSelect"));
        return;
      }
      if (!efpActions(efp, true).canResume) {
        MessageBox.alert(this.text("marketEfpResumeBlocked"));
        return;
      }
      await this.postOnEfp(efp, ServerRoutes.marketEfpResume(efp.Id), "marketEfpResumed");
    });
  }

  async onCancelEfp(): Promise<void> {
    await this.exclusive(async () => {
      const efp = this.selectedEfp();
      if (!efp) {
        MessageBox.alert(this.text("marketEfpSelect"));
        return;
      }
      if (!efpActions(efp, true).canCancel) {
        MessageBox.alert(this.text("marketEfpCancelBlocked"));
        return;
      }
      if (!(await confirmDialog(this.text("marketEfpCancelConfirm", [String(efp.Id), efp.ContractCode ?? ""]), this.text("marketEfpCancel")))) return;
      await this.postOnEfp(efp, ServerRoutes.marketEfpCancel(efp.Id), "marketEfpCanceled");
    });
  }

  private async postOnEfp(efp: MarketEfp, url: string, successKey: string): Promise<void> {
    this.setBusy(true);
    try {
      const result = await marketFetch("POST", url);
      if (!result.ok) {
        this.showError(result);
        return;
      }
      MessageToast.show(this.text(successKey));
      this.binding()?.refresh();
    } finally {
      this.setBusy(false);
    }
  }

  onOpenContract(): void {
    const efp = this.selectedEfp();
    if (!efp?.ContractKey) {
      MessageBox.alert(this.text("marketEfpSelect"));
      return;
    }
    this.navTo(contractRouteName(efp.ContractSide), { id: efp.ContractKey });
  }

  // -------------------------------------------------------------------------------------------
  // Diálogo "Novo EFP"
  // -------------------------------------------------------------------------------------------

  async onCreate(): Promise<void> {
    await this.exclusive(async () => {
      const lookup = (this.getView().getModel("lookup") as JSONModel).getData() as { accounts: { id: string; label: string }[] };
      this.lotInfoCache.clear();
      const form: EfpDialogModel = {
        date: localIsoDate(new Date()), contractSide: "purchase", contractKey: "", accountId: lookup.accounts.length === 1 ? lookup.accounts[0].id : "",
        instrumentCode: "", side: defaultFuturesSide("purchase"), lots: "", price: "", premium: "", fxRate: "", bags: "",
        financialDueDate: "", notes: "", accounts: lookup.accounts, contractCode: "", contractCurrency: "", availableKg: null,
        availableText: EMPTY_VALUE, contractInfo: "", bagsInfo: "", lotsInfo: "", fxEnabled: false, fxRefused: false, fxInfo: "",
        ...BLANK_PREVIEW,
      };
      this.efpModel().setData(form);
      this.efpDialog ??= await this.loadFragment({ name: "siagrob1.view.marketEfps.fragments.EfpDialog" }) as Dialog;
      this.markErrors({});
      this.efpDialog.open();
    });
  }

  onEfpCancel(): void {
    this.efpDialog?.close();
  }

  /** Marca (ou limpa) o estado de erro de cada campo; `errors` traz a chave de i18n por campo. */
  private markErrors(errors: EfpFormErrors): void {
    for (const field of Object.keys(FIELD_CONTROL) as EfpField[]) {
      const control = this.byId(FIELD_CONTROL[field]) as unknown as Markable;
      if (!control) continue;
      control.setValueState(errors[field] ? "Error" : "None");
      if (errors[field]) control.setValueStateText(this.text(errors[field]));
    }
  }

  /** Trocar o lado do contrato descarta o contrato escolhido (a lista é de outro lado) e sugere o lado da bolsa. */
  onContractSideChange(): void {
    const model = this.efpModel();
    model.setProperty("/contractKey", "");
    model.setProperty("/contractCode", "");
    model.setProperty("/contractCurrency", "");
    model.setProperty("/availableKg", null);
    model.setProperty("/contractInfo", "");
    model.setProperty("/financialDueDate", "");
    model.setProperty("/side", defaultFuturesSide(model.getProperty("/contractSide") as string));
    this.recompute();
  }

  onInstrumentChange(): void {
    this.recompute();
    void this.refreshLotsInfo();
  }

  onBagsLiveChange(ev: Input$LiveChangeEvent): void {
    // O binding só grava no change: durante a digitação o valor vem do evento.
    this.efpModel().setProperty("/bags", ev.getParameter("value"));
    this.recompute();
  }

  onLotsLiveChange(ev: Input$LiveChangeEvent): void {
    this.efpModel().setProperty("/lots", ev.getParameter("value"));
    void this.refreshLotsInfo();
  }

  /** Texto digitado em preço, prêmio ou câmbio: o binding só grava no change, então o resultado velho sai já na digitação. */
  onPreviewInputLiveChange(): void {
    this.invalidatePreview();
  }

  private quoteUnitOf(code: string): string {
    const futures = (this.getView().getModel("lookup") as JSONModel).getProperty("/futures") as { Code: string; QuoteUnit: string }[];
    return futures.find((instrument) => instrument.Code === code)?.QuoteUnit;
  }

  /** Recalcula o que depende de contrato + instrumento + volume: regra do câmbio, avisos e equivalência do volume. */
  private recompute(): void {
    const model = this.efpModel();
    const data = model.getData() as EfpDialogModel;
    const mode = fxMode(this.quoteUnitOf(data.instrumentCode), data.contractCurrency);
    model.setProperty("/fxEnabled", mode === "required");
    model.setProperty("/fxRefused", mode === "refused");
    model.setProperty("/fxInfo", mode === "required" ? this.text("marketEfpFxInfoRequired")
      : data.instrumentCode && data.contractCurrency && mode === "none" ? this.text("marketEfpFxInfoNone") : "");
    if (mode !== "required") model.setProperty("/fxRate", "");

    const bags = parseStrictDecimal(data.bags);
    const tons = bags.error || bags.value === null ? null : (bags.value * 60) / 1000;
    model.setProperty("/bagsInfo", tons === null ? "" : this.text("marketEfpBagsTons", [formatTons(tons)]));
    // Sugestão visual do limite: o servidor é quem recusa de fato.
    const exceeds = !bags.error && bags.value !== null && exceedsAvailable(bags.value, data.availableKg);
    const bagsControl = this.byId("efpBags") as unknown as Markable;
    if (bagsControl) {
      bagsControl.setValueState(exceeds ? "Error" : "None");
      if (exceeds) bagsControl.setValueStateText(this.text("marketEfpBagsExceed"));
    }
    this.invalidatePreview();
  }

  /** Qualquer mudança nos dados torna o resultado calculado velho: some até novo "Calcular". */
  private invalidatePreview(): void {
    const model = this.efpModel();
    for (const [key, value] of Object.entries(BLANK_PREVIEW)) model.setProperty(`/${key}`, value);
  }

  /** Mostra as toneladas da perna de bolsa (lotes × t/lote) pelo `lot-info` do servidor. */
  private async refreshLotsInfo(): Promise<void> {
    const seq = ++this.lotInfoSeq;
    const data = this.efpModel().getData() as EfpDialogModel;
    const code = data.instrumentCode;
    if (!code) {
      this.efpModel().setProperty("/lotsInfo", "");
      return;
    }
    let info = this.lotInfoCache.get(code);
    if (!info) {
      const result = await marketFetch<MarketLotInfo>("GET", ServerRoutes.marketFuturesLotInfo(code));
      if (seq !== this.lotInfoSeq) return;
      if (!result.ok || !result.data) {
        this.efpModel().setProperty("/lotsInfo", "");
        return;
      }
      info = result.data;
      this.lotInfoCache.set(code, info);
    }
    const lots = parseLots(data.lots);
    const equivalent = lotEquivalent(info, lots ?? 1);
    if (!equivalent || equivalent.kind !== "tons") {
      this.efpModel().setProperty("/lotsInfo", "");
      return;
    }
    this.efpModel().setProperty("/lotsInfo", this.text(lots !== null ? "marketFuturesEquivalentTons" : "marketFuturesEquivalentTonsPerLot", [formatTons(equivalent.value)]));
  }

  // -------------------------------------------------------------------------------------------
  // Value help de contratos (REST)
  // -------------------------------------------------------------------------------------------

  async onPickContract(): Promise<void> {
    await this.exclusive(async () => {
      this.contractDialog ??= await this.loadFragment({ name: "siagrob1.view.marketEfps.fragments.ContractDialog" }) as TableSelectDialog;
      (this.getView().getModel("contracts") as JSONModel).setProperty("/rows", []);
      this.contractDialog.open("");
      void this.loadContracts("");
    });
  }

  onContractSearch(ev: TableSelectDialog$SearchEvent): void {
    void this.loadContracts(ev.getParameter("value") ?? "");
  }

  private async loadContracts(search: string): Promise<void> {
    const seq = ++this.contractsSeq;
    const model = this.getView().getModel("contracts") as JSONModel;
    model.setProperty("/busy", true);
    try {
      const side = this.efpModel().getProperty("/contractSide") as string;
      const result = await marketFetch<MarketEfpContract[]>("GET", ServerRoutes.marketEfpContracts(side, search.trim()));
      if (seq !== this.contractsSeq) return;
      if (!result.ok) {
        this.showError(result);
        return;
      }
      model.setProperty("/rows", result.data ?? []);
    } finally {
      if (seq === this.contractsSeq) model.setProperty("/busy", false);
    }
  }

  onContractCancel(): void {
    this.contractsSeq++;
  }

  onContractConfirm(ev: TableSelectDialog$ConfirmEvent): void {
    this.contractsSeq++;
    const contract = ev.getParameter("selectedItem")?.getBindingContext("contracts")?.getObject() as MarketEfpContract;
    if (!contract) return;
    const model = this.efpModel();
    model.setProperty("/contractKey", contract.key);
    model.setProperty("/contractCode", contract.code);
    model.setProperty("/contractCurrency", contract.currency ?? "");
    model.setProperty("/availableKg", contract.availableToPriceKg);
    model.setProperty("/availableText", this.text("marketEfpAvailableText", [formatBags(contract.availableToPriceKg)]));
    model.setProperty("/contractInfo", [contract.cardName, contract.itemName, currencySymbol(contract.currency)]
      .filter((part) => !!part).join(" · "));
    // Vencimento financeiro: a previsão de pagamento do contrato (o usuário pode trocar).
    model.setProperty("/financialDueDate", toIsoDate(contract.standardCashFlowDate));
    this.markErrors({});
    this.recompute();
  }

  // -------------------------------------------------------------------------------------------
  // Calcular e gravar
  // -------------------------------------------------------------------------------------------

  private context() {
    const data = this.efpModel().getData() as EfpDialogModel;
    return { quoteUnit: this.quoteUnitOf(data.instrumentCode), contractCurrency: data.contractCurrency, availableToPriceKg: data.availableKg };
  }

  /** Valida o formulário e pede o cálculo ao servidor; `null` quando algo impediu (a mensagem já foi mostrada). */
  private async requestPreview(): Promise<MarketEfpPreview> {
    const { payload, errors } = buildEfpPayload(this.efpModel().getData() as EfpForm, this.context());
    this.markErrors(errors);
    if (!payload) {
      MessageBox.warning(this.text(Object.values(errors)[0]));
      return null;
    }
    const result = await marketFetch<MarketEfpPreview>("POST", ServerRoutes.marketEfpPreview, payload);
    if (!result.ok) {
      this.showError(result);
      return null;
    }
    return result.data ?? {};
  }

  async onCalculate(): Promise<void> {
    await this.exclusive(async () => {
      const signature = efpInputSignature(this.efpModel().getData() as EfpForm);
      this.setBusy(true);
      try {
        const preview = await this.requestPreview();
        if (!preview) return;
        // O usuário mexeu num campo enquanto o cálculo voltava: o resultado já nasceu velho.
        if (signature !== efpInputSignature(this.efpModel().getData() as EfpForm)) return;
        const model = this.efpModel();
        model.setProperty("/previewPerBag", formatBagPrice(preview.fixationPricePerBag, preview.currency));
        model.setProperty("/previewPerKg", `${formatPerKg(preview.fixationPricePerKg)} ${this.text("marketEfpPerKgUnit")}`);
        model.setProperty("/previewTonsFutures", `${formatTons(preview.tonsFutures)} t`);
        model.setProperty("/previewTonsPhysical", `${formatTons(preview.tonsPhysical)} t`);
        // Divergência acima de 5 %: aviso, não erro (pode haver arredondamento de lotes).
        model.setProperty("/mismatch", tonsMismatch(preview.tonsFutures, preview.tonsPhysical));
        model.setProperty("/previewVisible", true);
      } finally {
        this.setBusy(false);
      }
    });
  }

  async onEfpSave(): Promise<void> {
    await this.exclusive(async () => {
      const data = this.efpModel().getData() as EfpDialogModel;
      if (!data.previewVisible) {
        MessageBox.warning(this.text("marketEfpCalculateFirst"));
        return;
      }
      const signature = efpInputSignature(data);
      const built = buildEfpPayload(data, this.context());
      this.markErrors(built.errors);
      if (!built.payload) {
        MessageBox.warning(this.text(Object.values(built.errors)[0]));
        return;
      }
      // O resumo da confirmação mostra o preço por saca que o SERVIDOR calcula agora (nunca um valor velho da tela).
      this.setBusy(true);
      let preview: MarketEfpPreview;
      try {
        const previewResult = await marketFetch<MarketEfpPreview>("POST", ServerRoutes.marketEfpPreview, built.payload);
        if (!previewResult.ok) {
          this.showError(previewResult);
          return;
        }
        preview = previewResult.data ?? {};
      } finally {
        this.setBusy(false);
      }
      const summary = this.text("marketEfpSaveConfirm", [
        formatBags(built.payload.volumeKg), data.contractCode, formatBagPrice(preview.fixationPricePerBag, preview.currency),
        String(built.payload.lots), data.instrumentCode,
      ]);
      if (!(await confirmDialog(summary, this.text("marketEfpSave")))) return;
      if (signature !== efpInputSignature(this.efpModel().getData() as EfpForm)) {
        MessageBox.warning(this.text("marketEfpChangedWhileConfirming"));
        return;
      }

      this.setBusy(true);
      try {
        const result = await marketFetch("POST", ServerRoutes.marketEfps, built.payload);
        if (!result.ok) {
          this.showError(result);
          // Uma falha no meio pode ter deixado o EFP "Processando" (retomável): a lista precisa mostrá-lo.
          this.binding()?.refresh();
          return;
        }
        this.efpDialog?.close();
        MessageToast.show(this.text("marketEfpSaved"));
        this.binding()?.refresh();
      } finally {
        this.setBusy(false);
      }
    });
  }
}
